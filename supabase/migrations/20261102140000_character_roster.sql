-- =============================================================================
-- Migration: character roster (characters instead of outfits), level unlocks, Meera as the base
-- Builds on 20261102120000_base_character_riya.sql. Safe to run more than once.
--
-- The shop now sells characters, not outfits. Every new character is the detailed CC body
-- (avatars/ojas_fc1.glb) in its own look (config.look: skin tint and dyes). Some cost coins; some
-- are free once the player reaches a level (unlock_level), checked here from the same XP the app
-- shows (src/utils/gamification.ts: computeTotalXp, xpToReachLevel).
-- Riya is retired: Meera (now the CC body in her own look) is the default, and every player on
-- Riya moves to Meera.
-- =============================================================================

-- 1. Level unlocks
ALTER TABLE public.avatar_models ADD COLUMN IF NOT EXISTS unlock_level INTEGER;

-- Total XP, as computeTotalXp() in the app: 1 per rep, 25 per match, 2 per kcal, 50 per quest.
CREATE OR REPLACE FUNCTION public.profile_total_xp(p_profile public.profiles)
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
  )::INTEGER;
$$;

-- Level, as levelFromXp(): reaching level L takes 50 * (L - 1) * L XP in total.
CREATE OR REPLACE FUNCTION public.profile_level(p_profile public.profiles)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_xp INTEGER := public.profile_total_xp(p_profile);
  v_level INTEGER := 1;
BEGIN
  WHILE v_xp >= 50 * v_level * (v_level + 1) LOOP
    v_level := v_level + 1;
  END LOOP;
  RETURN v_level;
END;
$$;

-- 2. Equip: owned, default, or free; a level character only once the player has the level, and
-- equipping it the first time adds it to the roster.
CREATE OR REPLACE FUNCTION public.equip_avatar(p_avatar_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles;
  v_item public.avatar_models;
  v_owned BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to change your avatar.');
  END IF;

  SELECT * INTO v_item FROM public.avatar_models WHERE id = p_avatar_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  v_owned := p_avatar_id = ANY(v_profile.owned_avatar_ids) OR v_item.is_default;
  IF NOT v_owned AND v_item.price_coins = 0 THEN
    IF v_item.unlock_level IS NULL THEN
      v_owned := TRUE;
    ELSIF public.profile_level(v_profile) >= v_item.unlock_level THEN
      v_owned := TRUE;
      UPDATE public.profiles SET owned_avatar_ids = array_append(owned_avatar_ids, p_avatar_id) WHERE id = v_uid;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Reach level ' || v_item.unlock_level || ' to unlock ' || v_item.name || '.');
    END IF;
  END IF;
  IF NOT v_owned THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You do not own this item yet.');
  END IF;

  IF v_item.category = 'character' THEN
    UPDATE public.profiles SET equipped_avatar_id = p_avatar_id, updated_at = NOW() WHERE id = v_uid;
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF v_item.character_id IS NOT NULL AND v_item.character_id <> v_profile.equipped_avatar_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This item does not fit your current character.');
  END IF;

  UPDATE public.profiles
  SET equipped_items = jsonb_set(
        COALESCE(equipped_items, '{}'::jsonb),
        ARRAY[equipped_avatar_id],
        COALESCE(equipped_items -> equipped_avatar_id, '{}'::jsonb) || jsonb_build_object(v_item.category, p_avatar_id)
      ),
      updated_at = NOW()
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. Purchase: level characters cannot be bought, only earned
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
  IF v_model.unlock_level IS NOT NULL AND v_model.price_coins = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', v_model.name || ' is a level ' || v_model.unlock_level || ' reward.');
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

REVOKE ALL ON FUNCTION public.equip_avatar(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_avatar(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equip_avatar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_avatar(TEXT) TO authenticated;

-- 4. Meera: the base character, the CC body in her own look
UPDATE public.avatar_models
SET model_url = 'local://avatars/ojas_fc1.glb',
    config = '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.74,0.58,0.46]},"dye":{"outfit_":"#D63A7A"}}}',
    thumbnail_url = 'local://avatars/fc1_meera.png',
    description = 'Every athlete starts here. Earn coins for new gear.',
    is_default = TRUE, sort_order = -1, is_active = TRUE
WHERE id = 'starter_ojas_f';
UPDATE public.avatar_models SET is_default = FALSE WHERE category = 'character' AND id <> 'starter_ojas_f';

-- 5. The roster
INSERT INTO public.avatar_models
  (id, name, description, rarity, price_coins, category, character_id, model_url, model_format, config, thumbnail_url, is_default, sort_order, unlock_level)
VALUES
  ('char_kavya', 'Kavya', 'Reach level 3 to unlock.', 'rare', 0, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.58,0.43,0.33]},"dye":{"outfit_":"#0F7A64"}}}', 'local://avatars/char_kavya.png', FALSE, 2, 3),
  ('char_zoya', 'Zoya', 'Reach level 6 to unlock.', 'rare', 0, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.95,0.86,0.78]},"dye":{"hair_":"#9A6A3A","outfit_":"#5B2C83"}}}', 'local://avatars/char_zoya.png', FALSE, 3, 6),
  ('char_ishani', 'Ishani', 'Reach level 10 to unlock.', 'epic', 0, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.48,0.35,0.27]},"dye":{"outfit_":"#C2621F"}}}', 'local://avatars/char_ishani.png', FALSE, 4, 10),
  ('char_aarohi', 'Aarohi', 'Reach level 15 to unlock.', 'legendary', 0, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.82,0.66,0.54]},"dye":{"outfit_":"#B76E79"}}}', 'local://avatars/char_aarohi.png', FALSE, 5, 15),
  ('char_naina', 'Naina', 'Auburn hair, navy dress.', 'rare', 300, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.86,0.74,0.64]},"dye":{"hair_":"#8E3B1F","outfit_":"#1B2A4A"}}}', 'local://avatars/char_naina.png', FALSE, 6, NULL),
  ('char_tara', 'Tara', 'Match-day red.', 'rare', 450, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.7,0.55,0.44]},"dye":{"outfit_":"#A3122A"}}}', 'local://avatars/char_tara.png', FALSE, 7, NULL),
  ('char_elena', 'Elena', 'Golden hair, forest green.', 'epic', 700, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"dye":{"hair_":"#C9A26B","outfit_":"#2E6B2E"}}}', 'local://avatars/char_elena.png', FALSE, 8, NULL),
  ('char_sana', 'Sana', 'Violet hair, all in white.', 'epic', 900, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.62,0.47,0.36]},"dye":{"hair_":"#6B2D8C","outfit_":"#E8E8EC"}}}', 'local://avatars/char_sana.png', FALSE, 9, NULL),
  ('char_rani', 'Rani', 'Silver hair, champion gold.', 'legendary', 1500, 'character', NULL, 'local://avatars/ojas_fc1.glb', 'glb', '{"materials":{"shoes":["shoes_upper"]},"look":{"tint":{"skin_":[0.74,0.58,0.46]},"dye":{"hair_":"#B0B4BC","outfit_":"#C9A227"}}}', 'local://avatars/char_rani.png', FALSE, 10, NULL)

ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, rarity = EXCLUDED.rarity,
    price_coins = EXCLUDED.price_coins, model_url = EXCLUDED.model_url, model_format = EXCLUDED.model_format,
    config = EXCLUDED.config, thumbnail_url = EXCLUDED.thumbnail_url, is_default = EXCLUDED.is_default,
    sort_order = EXCLUDED.sort_order, unlock_level = EXCLUDED.unlock_level, is_active = TRUE;

-- 6. Riya is retired: her players move to Meera, new players start as Meera
UPDATE public.avatar_models SET is_active = FALSE, is_default = FALSE WHERE id = 'starter_fc1';

UPDATE public.profiles
SET equipped_avatar_id = CASE WHEN equipped_avatar_id = 'starter_fc1' THEN 'starter_ojas_f' ELSE equipped_avatar_id END,
    owned_avatar_ids = array_remove(owned_avatar_ids, 'starter_fc1'),
    equipped_items = COALESCE(equipped_items, '{}'::jsonb) - 'starter_fc1'
WHERE equipped_avatar_id = 'starter_fc1' OR 'starter_fc1' = ANY(owned_avatar_ids) OR equipped_items ? 'starter_fc1';

ALTER TABLE public.profiles
  ALTER COLUMN owned_avatar_ids SET DEFAULT ARRAY['starter_ojas', 'starter_ojas_f']::TEXT[],
  ALTER COLUMN equipped_avatar_id SET DEFAULT 'starter_ojas_f';

CREATE OR REPLACE FUNCTION public.protect_profile_avatar_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.owned_avatar_ids := ARRAY['starter_ojas', 'starter_ojas_f']::TEXT[];
      NEW.equipped_avatar_id := 'starter_ojas_f';
      NEW.equipped_items := '{}'::jsonb;
      NEW.coins_spent := 0;
    ELSE
      NEW.owned_avatar_ids := OLD.owned_avatar_ids;
      NEW.equipped_avatar_id := OLD.equipped_avatar_id;
      NEW.equipped_items := OLD.equipped_items;
      NEW.coins_spent := OLD.coins_spent;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
