-- =============================================================================
-- Migration: Meera wears sportswear
-- The base body (avatars/ojas_fc1.glb) now carries a second outfit, a tank top with shorts over
-- leggings (sport_* materials). Meera's look picks it instead of the dyed dress. The app's bundled
-- config already overrides this row; this keeps the server in step. Safe to run more than once.
-- =============================================================================

UPDATE public.avatar_models
SET config = '{"materials": {"shoes": ["shoes_upper"]}, "look": {"tint": {"skin_": [0.74, 0.58, 0.46]}, "outfit": "sport"}}'
WHERE id = 'starter_ojas_f';
