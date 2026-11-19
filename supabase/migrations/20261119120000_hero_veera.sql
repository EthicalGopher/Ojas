-- =============================================================================
-- Migration: a new hero, Veera (the undercity brawler), bought with coins
-- DRAFT: do not run until the app version that ships avatars/brawler.glb is installed (older apps would
-- list a hero whose model they do not have). Until it runs, the app shows her with "Coming soon" on the
-- buy button (BUNDLED_AVATARS, notOnServer).
--
-- The app's own copy (src/utils/avatarShopService.ts BUNDLED_AVATARS) carries her model, look, card and
-- hero page; the server row only needs her identity, price and order. Safe to run more than once.
-- =============================================================================

INSERT INTO public.avatar_models
  (id, name, description, rarity, price_coins, category, character_id, model_url, model_format, config,
   thumbnail_url, is_default, sort_order, is_active)
VALUES
  ('hero_veera', 'Veera', 'The undercity brawler. Recruit her with coins.', 'legendary', 1200,
   'character', NULL, 'local://avatars/brawler.glb', 'glb', '{}',
   'local://avatars/brawler.png', FALSE, 1, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, rarity = EXCLUDED.rarity,
    price_coins = EXCLUDED.price_coins, category = 'character', model_url = EXCLUDED.model_url,
    model_format = 'glb', thumbnail_url = EXCLUDED.thumbnail_url, is_default = FALSE,
    sort_order = EXCLUDED.sort_order, is_active = TRUE;
