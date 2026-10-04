-- =============================================================================
-- Migration: 3D avatar shop
-- A catalog of 3D body models (VRM or GLB, e.g. exported from Daz or Blender),
-- per-user ownership, the equipped model, and coin purchases.
--
-- Coins are earned from XP (1 coin per 10 XP, same XP rules as
-- src/utils/gamification.ts) and spent in the shop. The balance is computed
-- here, so the app cannot spend coins it does not have.
-- =============================================================================

-- 1. Catalog
CREATE TABLE IF NOT EXISTS public.avatar_models (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_]{2,40}$'),
    name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 60),
    description TEXT NOT NULL DEFAULT '',
    rarity TEXT NOT NULL DEFAULT 'common'
      CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
    price_coins INTEGER NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
    -- 'local://avatars/x.vrm' = bundled in the APK; anything else is a full https URL
    model_url TEXT NOT NULL,
    model_format TEXT NOT NULL DEFAULT 'vrm' CHECK (model_format IN ('vrm', 'glb')),
    thumbnail_url TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_avatar_models_shop ON public.avatar_models (is_active, sort_order);

ALTER TABLE public.avatar_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Avatar models are viewable by everyone" ON public.avatar_models;
CREATE POLICY "Avatar models are viewable by everyone"
ON public.avatar_models FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins can insert avatar models" ON public.avatar_models;
CREATE POLICY "Admins can insert avatar models"
ON public.avatar_models FOR INSERT
TO authenticated
WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can update avatar models" ON public.avatar_models;
CREATE POLICY "Admins can update avatar models"
ON public.avatar_models FOR UPDATE
TO authenticated
USING ((select public.is_admin()))
WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can delete avatar models" ON public.avatar_models;
CREATE POLICY "Admins can delete avatar models"
ON public.avatar_models FOR DELETE
TO authenticated
USING ((select public.is_admin()));

-- Starter model, bundled in the APK so it works offline
INSERT INTO public.avatar_models (id, name, description, rarity, price_coins, model_url, model_format, is_default, sort_order)
VALUES ('starter_aiko', 'Aiko', 'Your first training partner. Free for every athlete.', 'common', 0,
        'local://avatars/girl_model1.vrm', 'vrm', TRUE, 0)
ON CONFLICT (id) DO NOTHING;

-- 2. Ownership on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS owned_avatar_ids TEXT[] NOT NULL DEFAULT ARRAY['starter_aiko']::TEXT[],
ADD COLUMN IF NOT EXISTS equipped_avatar_id TEXT NOT NULL DEFAULT 'starter_aiko',
ADD COLUMN IF NOT EXISTS coins_spent INTEGER NOT NULL DEFAULT 0 CHECK (coins_spent >= 0);

-- 3. App users may not edit ownership or spending directly; only the
--    SECURITY DEFINER functions below (which run as the table owner) can.
CREATE OR REPLACE FUNCTION public.protect_profile_avatar_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.owned_avatar_ids := ARRAY['starter_aiko']::TEXT[];
      NEW.equipped_avatar_id := 'starter_aiko';
      NEW.coins_spent := 0;
    ELSE
      NEW.owned_avatar_ids := OLD.owned_avatar_ids;
      NEW.equipped_avatar_id := OLD.equipped_avatar_id;
      NEW.coins_spent := OLD.coins_spent;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_avatar_columns ON public.profiles;
CREATE TRIGGER protect_profile_avatar_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_avatar_columns();

-- 4. Coins earned = floor(XP / 10), XP from the synced activity logs
CREATE OR REPLACE FUNCTION public.profile_coins_earned(p_profile public.profiles)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (
    COALESCE((
      SELECT SUM(
          COALESCE((v->>'reps')::NUMERIC, 0)
        + COALESCE((v->>'matches')::NUMERIC, 0) * 25
        + ROUND(COALESCE((v->>'calories')::NUMERIC, 0) * 2)
      )
      FROM jsonb_each(COALESCE(p_profile.daily_calories, '{}'::jsonb)) AS d(k, v)
      WHERE jsonb_typeof(v) = 'object'
    ), 0)
    +
    COALESCE((
      SELECT SUM(jsonb_array_length(v->'completedIds')) * 50
      FROM jsonb_each(COALESCE(p_profile.daily_challenges, '{}'::jsonb)) AS d(k, v)
      WHERE jsonb_typeof(v) = 'object' AND jsonb_typeof(v->'completedIds') = 'array'
    ), 0)
  )::INTEGER / 10;
$$;

-- 5. Purchase: checks the balance, records ownership and auto-equips
CREATE OR REPLACE FUNCTION public.purchase_avatar(p_avatar_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles;
  v_model public.avatar_models;
  v_balance INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to buy avatars.');
  END IF;

  SELECT * INTO v_model FROM public.avatar_models WHERE id = p_avatar_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This avatar is no longer available.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found.');
  END IF;

  v_balance := public.profile_coins_earned(v_profile) - v_profile.coins_spent;

  IF p_avatar_id = ANY(v_profile.owned_avatar_ids) THEN
    RETURN jsonb_build_object('ok', true, 'already_owned', true, 'coins_balance', v_balance);
  END IF;

  IF v_balance < v_model.price_coins THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough coins.', 'coins_balance', v_balance);
  END IF;

  UPDATE public.profiles
  SET owned_avatar_ids = array_append(owned_avatar_ids, p_avatar_id),
      equipped_avatar_id = p_avatar_id,
      coins_spent = coins_spent + v_model.price_coins,
      updated_at = NOW()
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'coins_balance', v_balance - v_model.price_coins);
END;
$$;

-- 6. Equip a model the user owns (default models are always allowed)
CREATE OR REPLACE FUNCTION public.equip_avatar(p_avatar_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to change your avatar.');
  END IF;

  UPDATE public.profiles p
  SET equipped_avatar_id = p_avatar_id,
      updated_at = NOW()
  WHERE p.id = v_uid
    AND (
      p_avatar_id = ANY(p.owned_avatar_ids)
      OR EXISTS (SELECT 1 FROM public.avatar_models m WHERE m.id = p_avatar_id AND m.is_default)
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not own this avatar yet.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_avatar(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.equip_avatar(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_avatar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.equip_avatar(TEXT) TO authenticated;

-- 7. Public bucket for model files and thumbnails; only admins upload
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatar-models', 'avatar-models', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view avatar models" ON storage.objects;
CREATE POLICY "Public can view avatar models"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatar-models');

DROP POLICY IF EXISTS "Admins can upload avatar models" ON storage.objects;
CREATE POLICY "Admins can upload avatar models"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatar-models' AND (select public.is_admin()));

DROP POLICY IF EXISTS "Admins can update avatar models files" ON storage.objects;
CREATE POLICY "Admins can update avatar models files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatar-models' AND (select public.is_admin()))
WITH CHECK (bucket_id = 'avatar-models' AND (select public.is_admin()));

DROP POLICY IF EXISTS "Admins can delete avatar models files" ON storage.objects;
CREATE POLICY "Admins can delete avatar models files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatar-models' AND (select public.is_admin()));
