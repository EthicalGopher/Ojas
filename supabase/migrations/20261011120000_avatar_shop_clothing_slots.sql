-- =============================================================================
-- Migration: split the avatar shop "outfit" slot into top, pants and shoes
-- Builds on 20261004140000_avatar_shop_items.sql. Safe to run more than once.
--
-- Clothing and hair are now colour items that fit any character:
--   { "color": "#hex", "swatch": [...] }
-- Each character says which of its own materials make up each slot:
--   config.materials = { "top": ["Tops"], "pants": ["Onepiece"], "shoes": [...], "hair": ["HAIR"] }
-- A colour item only shows for characters that map its slot. Recolour configs
-- ({"recolor": {...}}) and skinned clothing GLBs ({"model_url", "hide"}) still work.
-- Loadouts become { "top", "pants", "shoes", "hair", "accessory" } per character.
-- =============================================================================

-- 1. Categories
ALTER TABLE public.avatar_models DROP CONSTRAINT IF EXISTS avatar_models_category_check;

UPDATE public.avatar_models SET category = 'top'
WHERE category = 'outfit';

ALTER TABLE public.avatar_models
  ADD CONSTRAINT avatar_models_category_check
  CHECK (category IN ('character', 'top', 'pants', 'shoes', 'hair', 'accessory'));

-- 2. Slot materials for the starter character
UPDATE public.avatar_models
SET config = config || '{"materials": {"top": ["Tops"], "pants": ["Onepiece"], "hair": ["HAIR"]}}'::jsonb
WHERE id = 'starter_aiko';

-- 3. New catalog
INSERT INTO public.avatar_models (id, name, description, rarity, price_coins, category, character_id, config, sort_order)
VALUES
  ('top_midnight', 'Midnight Hoodie', 'Deep navy hoodie for late training sessions.', 'common', 120, 'top', NULL,
   '{"color": "#3B4A8C", "swatch": ["#3B4A8C"]}', 10),
  ('top_mint', 'Mint Hoodie', 'Fresh mint hoodie.', 'common', 120, 'top', NULL,
   '{"color": "#7FD8B8", "swatch": ["#7FD8B8"]}', 11),
  ('top_crimson', 'Crimson Top', 'Match-day crimson.', 'rare', 300, 'top', NULL,
   '{"color": "#C2283A", "swatch": ["#C2283A"]}', 12),
  ('top_gold', 'Gold Varsity', 'Champion gold top.', 'epic', 650, 'top', NULL,
   '{"color": "#F2B829", "swatch": ["#F2B829"]}', 13),
  ('pants_charcoal', 'Charcoal Joggers', 'Everyday training bottoms.', 'common', 100, 'pants', NULL,
   '{"color": "#3A3A44", "swatch": ["#3A3A44"]}', 15),
  ('pants_white', 'Clean White', 'Crisp white bottoms.', 'common', 100, 'pants', NULL,
   '{"color": "#F4F4F6", "swatch": ["#F4F4F6"]}', 16),
  ('pants_navy', 'Navy Track Pants', 'Classic track navy.', 'rare', 240, 'pants', NULL,
   '{"color": "#1F2A5C", "swatch": ["#1F2A5C"]}', 17),
  ('pants_black', 'Black Pro', 'Black bottoms for the pros.', 'epic', 500, 'pants', NULL,
   '{"color": "#16161C", "swatch": ["#16161C"]}', 18),
  ('shoes_white', 'White Runners', 'Clean white running shoes.', 'common', 90, 'shoes', NULL,
   '{"color": "#F4F4F6", "swatch": ["#F4F4F6"]}', 25),
  ('shoes_volt', 'Volt Trainers', 'Bright volt trainers.', 'rare', 220, 'shoes', NULL,
   '{"color": "#C6F432", "swatch": ["#C6F432"]}', 26),
  ('shoes_red', 'Red Sprinters', 'Fast red sprint shoes.', 'epic', 450, 'shoes', NULL,
   '{"color": "#E0303E", "swatch": ["#E0303E"]}', 27),
  ('hair_jet', 'Jet Black', 'Glossy jet-black hair.', 'common', 100, 'hair', NULL,
   '{"color": "#3A3A46", "swatch": ["#3A3A46"]}', 30),
  ('hair_auburn', 'Auburn', 'Warm auburn tones.', 'rare', 220, 'hair', NULL,
   '{"color": "#D9784F", "swatch": ["#D9784F"]}', 31),
  ('hair_rose', 'Rose', 'Soft rose-pink hair.', 'epic', 420, 'hair', NULL,
   '{"color": "#F2A7C3", "swatch": ["#F2A7C3"]}', 32)
ON CONFLICT (id) DO NOTHING;

UPDATE public.avatar_models SET sort_order = 40 WHERE id = 'acc_headband';
UPDATE public.avatar_models SET sort_order = 41 WHERE id = 'acc_cap';
UPDATE public.avatar_models SET sort_order = 42 WHERE id = 'acc_halo';

-- 4. Retire the Aiko-only items; owners get the new items that replace them
UPDATE public.avatar_models SET is_active = FALSE
WHERE id IN ('aiko_hoodie_midnight', 'aiko_hoodie_mint', 'aiko_hoodie_crimson', 'aiko_varsity_gold',
             'aiko_hair_jet', 'aiko_hair_auburn', 'aiko_hair_rose');

WITH replacements (old_id, new_id) AS (
  VALUES
    ('aiko_hoodie_midnight', 'top_midnight'),
    ('aiko_hoodie_mint', 'top_mint'),
    ('aiko_hoodie_crimson', 'top_crimson'),
    ('aiko_hoodie_crimson', 'pants_charcoal'),
    ('aiko_varsity_gold', 'top_gold'),
    ('aiko_varsity_gold', 'pants_black'),
    ('aiko_hair_jet', 'hair_jet'),
    ('aiko_hair_auburn', 'hair_auburn'),
    ('aiko_hair_rose', 'hair_rose')
),
granted AS (
  SELECT p.id, array_agg(DISTINCT r.new_id) AS new_ids
  FROM public.profiles p
  JOIN replacements r ON r.old_id = ANY(p.owned_avatar_ids)
  GROUP BY p.id
)
UPDATE public.profiles p
SET owned_avatar_ids = ARRAY(SELECT DISTINCT unnest(p.owned_avatar_ids || g.new_ids))
FROM granted g
WHERE p.id = g.id;

-- Loadouts: "outfit" -> "top" (+ "pants" for the two-tone sets), old hair ids -> new ones
UPDATE public.profiles
SET equipped_items = jsonb_set(
  equipped_items,
  '{starter_aiko}',
  (equipped_items -> 'starter_aiko') - 'outfit' - 'hair' || jsonb_strip_nulls(jsonb_build_object(
    'top', CASE equipped_items -> 'starter_aiko' ->> 'outfit'
             WHEN 'aiko_hoodie_midnight' THEN 'top_midnight'
             WHEN 'aiko_hoodie_mint' THEN 'top_mint'
             WHEN 'aiko_hoodie_crimson' THEN 'top_crimson'
             WHEN 'aiko_varsity_gold' THEN 'top_gold'
           END,
    'pants', CASE equipped_items -> 'starter_aiko' ->> 'outfit'
               WHEN 'aiko_hoodie_crimson' THEN 'pants_charcoal'
               WHEN 'aiko_varsity_gold' THEN 'pants_black'
             END,
    'hair', CASE equipped_items -> 'starter_aiko' ->> 'hair'
              WHEN 'aiko_hair_jet' THEN 'hair_jet'
              WHEN 'aiko_hair_auburn' THEN 'hair_auburn'
              WHEN 'aiko_hair_rose' THEN 'hair_rose'
              ELSE equipped_items -> 'starter_aiko' ->> 'hair'
            END
  ))
)
WHERE equipped_items ? 'starter_aiko'
  AND (equipped_items -> 'starter_aiko' ? 'outfit' OR equipped_items -> 'starter_aiko' ->> 'hair' LIKE 'aiko_hair_%');

-- 5. Unequip accepts the new slots
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
  IF p_slot NOT IN ('top', 'pants', 'shoes', 'hair', 'accessory') THEN
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

REVOKE ALL ON FUNCTION public.unequip_avatar_slot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unequip_avatar_slot(TEXT) TO authenticated;
