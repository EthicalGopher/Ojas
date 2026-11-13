-- =============================================================================
-- Migration: a new free default hero; Arjun and Meera are bought with coins
-- DRAFT: do not run until the app version that ships avatars/hero.glb is installed (older apps would
-- point every player at a model they do not have).
--
-- The default hero (starter_hero) is free for everyone and shown under the player's own username.
-- Arjun costs 500 coins and Meera 800. Every player, existing accounts included, is moved to the
-- default hero and loses the free Arjun and Meera (they were never bought, so there is nothing to
-- refund); they buy them like any other hero. Kits bought for Meera stay owned, ready for when she is
-- recruited again. Safe to run more than once.
-- =============================================================================

-- 1. The default hero
INSERT INTO public.avatar_models
  (id, name, description, rarity, price_coins, category, character_id, model_url, model_format, config,
   thumbnail_url, is_default, sort_order, is_active)
VALUES
  ('starter_hero', 'Ojas', 'Every athlete starts here. Earn coins to recruit Arjun and Meera.', 'common', 0,
   'character', NULL, 'local://avatars/hero.glb', 'glb', '{"nameFromUsername":true}',
   'local://avatars/hero.png', TRUE, -2, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, rarity = EXCLUDED.rarity,
    price_coins = 0, category = 'character', model_url = EXCLUDED.model_url, model_format = 'glb',
    config = EXCLUDED.config, thumbnail_url = EXCLUDED.thumbnail_url, is_default = TRUE,
    sort_order = -2, is_active = TRUE;

UPDATE public.avatar_models SET is_default = FALSE WHERE category = 'character' AND id <> 'starter_hero';

-- 2. Every existing player: the default hero, and no free Arjun or Meera. Runs once: only while Arjun is
--    still free (step 3 prices him), so running this file again never takes away a hero someone bought.
DO $$
BEGIN
  IF (SELECT price_coins FROM public.avatar_models WHERE id = 'starter_ojas') = 0 THEN
    UPDATE public.profiles p
    SET owned_avatar_ids = ARRAY['starter_hero']::TEXT[] || ARRAY(
          SELECT a FROM unnest(COALESCE(p.owned_avatar_ids, ARRAY[]::TEXT[])) a
          WHERE a NOT IN ('starter_hero', 'starter_ojas', 'starter_ojas_f', 'starter_fc1')),
        equipped_avatar_id = 'starter_hero',
        updated_at = NOW();
  END IF;
END $$;

-- 3. Arjun and Meera are bought with coins
UPDATE public.avatar_models
SET price_coins = 500, rarity = 'rare', unlock_level = NULL,
    description = 'The mountain trekker. Recruit him with coins.'
WHERE id = 'starter_ojas';
UPDATE public.avatar_models
SET price_coins = 800, rarity = 'epic', unlock_level = NULL,
    description = 'The comeback sprinter. Recruit her with coins.'
WHERE id = 'starter_ojas_f';

-- 4. New players start with the default hero only
ALTER TABLE public.profiles
  ALTER COLUMN owned_avatar_ids SET DEFAULT ARRAY['starter_hero']::TEXT[],
  ALTER COLUMN equipped_avatar_id SET DEFAULT 'starter_hero';

