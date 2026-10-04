-- =============================================================================
-- Migration: avatar shop categories (characters, outfits, hair, accessories)
-- Builds on 20261004120000_create_avatar_shop.sql. Safe to run more than once.
--
-- Every shop item lives in avatar_models:
--   character  - a body model (model_url + model_format)
--   outfit     - recolours the character's clothes ({"recolor": {...}}) or a
--                skinned GLB fitted to its skeleton ({"model_url", "hide": [...]})
--   hair       - recolours hair materials ({"recolor": {...}})
--   accessory  - attached to a bone: built in ({"builtin": "halo"}) or a GLB
--                ({"model_url", "bone", "position", "rotation", "scale"})
-- character_id ties an item to one character; NULL means it fits any character.
-- Each user keeps one loadout per character in profiles.equipped_items:
--   { "<character_id>": { "outfit": "<item>", "hair": "<item>", "accessory": "<item>" } }
-- =============================================================================

-- 1. Catalog columns
ALTER TABLE public.avatar_models
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'character',
ADD COLUMN IF NOT EXISTS character_id TEXT REFERENCES public.avatar_models(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.avatar_models ALTER COLUMN model_url DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avatar_models_category_check') THEN
    ALTER TABLE public.avatar_models
      ADD CONSTRAINT avatar_models_category_check
      CHECK (category IN ('character', 'outfit', 'hair', 'accessory'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'avatar_models_character_needs_model') THEN
    ALTER TABLE public.avatar_models
      ADD CONSTRAINT avatar_models_character_needs_model
      CHECK (category <> 'character' OR model_url IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_avatar_models_category ON public.avatar_models (category, character_id);

-- 2. Loadouts
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS equipped_items JSONB NOT NULL DEFAULT '{}'::jsonb;

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

-- 3. Equip: characters switch the body; other items go in that character's loadout slot
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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to change your avatar.');
  END IF;

  SELECT * INTO v_item FROM public.avatar_models WHERE id = p_avatar_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Item not found.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT (p_avatar_id = ANY(v_profile.owned_avatar_ids) OR v_item.is_default OR v_item.price_coins = 0) THEN
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

-- 4. Unequip a slot ('outfit' | 'hair' | 'accessory') on the current character
CREATE OR REPLACE FUNCTION public.unequip_avatar_slot(p_slot TEXT)
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
  IF p_slot NOT IN ('outfit', 'hair', 'accessory') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown slot.');
  END IF;

  UPDATE public.profiles
  SET equipped_items = jsonb_set(
        COALESCE(equipped_items, '{}'::jsonb),
        ARRAY[equipped_avatar_id],
        COALESCE(equipped_items -> equipped_avatar_id, '{}'::jsonb) - p_slot
      ),
      updated_at = NOW()
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Purchase: same balance check as before, then equip through equip_avatar()
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
    RETURN jsonb_build_object('ok', false, 'error', 'Sign in to buy items.');
  END IF;

  SELECT * INTO v_model FROM public.avatar_models WHERE id = p_avatar_id AND is_active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This item is no longer available.');
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Profile not found.');
  END IF;

  v_balance := public.profile_coins_earned(v_profile) - v_profile.coins_spent;

  IF p_avatar_id = ANY(v_profile.owned_avatar_ids) THEN
    RETURN jsonb_build_object('ok', true, 'already_owned', true, 'coins_balance', v_balance);
  END IF;

  IF v_model.character_id IS NOT NULL AND v_model.character_id <> v_profile.equipped_avatar_id
     AND NOT (v_model.character_id = ANY(v_profile.owned_avatar_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unlock the character this item belongs to first.');
  END IF;

  IF v_balance < v_model.price_coins THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not enough coins.', 'coins_balance', v_balance);
  END IF;

  UPDATE public.profiles
  SET owned_avatar_ids = array_append(owned_avatar_ids, p_avatar_id),
      coins_spent = coins_spent + v_model.price_coins,
      updated_at = NOW()
  WHERE id = v_uid;

  -- Wear it right away when it fits the current character
  IF v_model.category = 'character' OR v_model.character_id IS NULL OR v_model.character_id = v_profile.equipped_avatar_id THEN
    PERFORM public.equip_avatar(p_avatar_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'coins_balance', v_balance - v_model.price_coins);
END;
$$;

REVOKE ALL ON FUNCTION public.unequip_avatar_slot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unequip_avatar_slot(TEXT) TO authenticated;

-- 6. Starter items for Aiko (recolours of her own materials, plus built-in accessories)
INSERT INTO public.avatar_models (id, name, description, rarity, price_coins, category, character_id, config, sort_order)
VALUES
  ('aiko_hoodie_midnight', 'Midnight Hoodie', 'Deep navy hoodie for late training sessions.', 'common', 120, 'outfit', 'starter_aiko',
   '{"recolor": {"Tops": "#3B4A8C"}, "swatch": ["#3B4A8C", "#FFFFFF"]}', 10),
  ('aiko_hoodie_mint', 'Mint Hoodie', 'Fresh mint hoodie with clean white shorts.', 'common', 120, 'outfit', 'starter_aiko',
   '{"recolor": {"Tops": "#7FD8B8"}, "swatch": ["#7FD8B8", "#FFFFFF"]}', 11),
  ('aiko_hoodie_crimson', 'Crimson Set', 'Crimson hoodie with charcoal shorts. Match-day colours.', 'rare', 300, 'outfit', 'starter_aiko',
   '{"recolor": {"Tops": "#C2283A", "Onepiece": "#3A3A44"}, "swatch": ["#C2283A", "#3A3A44"]}', 12),
  ('aiko_varsity_gold', 'Gold Varsity', 'Champion gold top with black shorts.', 'epic', 650, 'outfit', 'starter_aiko',
   '{"recolor": {"Tops": "#F2B829", "Onepiece": "#1E1E26"}, "swatch": ["#F2B829", "#1E1E26"]}', 13),
  ('aiko_hair_jet', 'Jet Black', 'Glossy jet-black hair.', 'common', 100, 'hair', 'starter_aiko',
   '{"recolor": {"HAIR": "#3A3A46"}, "swatch": ["#3A3A46"]}', 20),
  ('aiko_hair_auburn', 'Auburn', 'Warm auburn tones.', 'rare', 220, 'hair', 'starter_aiko',
   '{"recolor": {"HAIR": "#D9784F"}, "swatch": ["#D9784F"]}', 21),
  ('aiko_hair_rose', 'Rose', 'Soft rose-pink hair.', 'epic', 420, 'hair', 'starter_aiko',
   '{"recolor": {"HAIR": "#F2A7C3"}, "swatch": ["#F2A7C3"]}', 22),
  ('acc_headband', 'Sport Headband', 'Sweat-proof headband. Fits every character.', 'common', 90, 'accessory', NULL,
   '{"builtin": "headband", "color": "#E25822", "swatch": ["#E25822"]}', 30),
  ('acc_cap', 'Training Cap', 'Classic training cap. Fits every character.', 'rare', 260, 'accessory', NULL,
   '{"builtin": "cap", "color": "#2A2470", "swatch": ["#2A2470", "#FFFFFF"]}', 31),
  ('acc_halo', 'Golden Halo', 'Only for the most dedicated athletes.', 'legendary', 1200, 'accessory', NULL,
   '{"builtin": "halo", "color": "#FBBF24", "swatch": ["#FBBF24"]}', 32)
ON CONFLICT (id) DO NOTHING;
