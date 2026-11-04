-- =============================================================================
-- Migration: Riya, the new base character
-- Builds on 20261011130000_starter_characters_and_faces.sql. Safe to run more than once.
--
-- Riya (avatars/ojas_fc1.glb, built by scripts/blender/build_fc1.py) is a detailed CC-rigged body
-- with the starters' five clips retargeted onto its own skeleton. She becomes the default for new
-- players; every existing player owns her and can switch in the character screen. Faces and kits
-- are made for the Rocketbox starters, so only her shoes take colour items.
-- =============================================================================

-- 1. The character
INSERT INTO public.avatar_models
  (id, name, description, rarity, price_coins, category, character_id, model_url, model_format, config, thumbnail_url, is_default, sort_order)
VALUES
  ('starter_fc1', 'Riya', 'Every athlete starts here. Earn coins for new gear.', 'common', 0, 'character', NULL,
   'local://avatars/ojas_fc1.glb', 'glb',
   '{"materials": {"shoes": ["shoes_upper"]}}', 'local://avatars/ojas_fc1.png', TRUE, -1)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, model_url = EXCLUDED.model_url,
    model_format = EXCLUDED.model_format, config = EXCLUDED.config, thumbnail_url = EXCLUDED.thumbnail_url,
    is_default = EXCLUDED.is_default, sort_order = EXCLUDED.sort_order, is_active = TRUE;

UPDATE public.avatar_models SET is_default = FALSE WHERE category = 'character' AND id <> 'starter_fc1';

-- 2. New profiles own all three starters and play as Riya
ALTER TABLE public.profiles
  ALTER COLUMN owned_avatar_ids SET DEFAULT ARRAY['starter_fc1', 'starter_ojas', 'starter_ojas_f']::TEXT[],
  ALTER COLUMN equipped_avatar_id SET DEFAULT 'starter_fc1';

CREATE OR REPLACE FUNCTION public.protect_profile_avatar_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.owned_avatar_ids := ARRAY['starter_fc1', 'starter_ojas', 'starter_ojas_f']::TEXT[];
      NEW.equipped_avatar_id := 'starter_fc1';
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

-- 3. Existing players own her too
UPDATE public.profiles
SET owned_avatar_ids = ARRAY(SELECT DISTINCT unnest(owned_avatar_ids || ARRAY['starter_fc1']::TEXT[]))
WHERE NOT (owned_avatar_ids @> ARRAY['starter_fc1']::TEXT[]);
