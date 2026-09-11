-- =============================================================================
-- Migration: Add health & posture conditions columns to public.profiles table
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS has_knock_knees BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_bow_legs BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_flat_feet BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_lower_back_pain BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_rounded_shoulders BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS health_conditions_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS health_conditions JSONB DEFAULT '{}'::jsonb;

-- Comment on columns
COMMENT ON COLUMN public.profiles.has_knock_knees IS 'User has knock knees (genu valgum)';
COMMENT ON COLUMN public.profiles.has_bow_legs IS 'User has bow legs (genu varum)';
COMMENT ON COLUMN public.profiles.has_flat_feet IS 'User has flat feet (pes planus)';
COMMENT ON COLUMN public.profiles.has_lower_back_pain IS 'User suffers from lower back pain or lumbar fatigue';
COMMENT ON COLUMN public.profiles.has_rounded_shoulders IS 'User has rounded shoulders or forward neck posture';
COMMENT ON COLUMN public.profiles.health_conditions_completed IS 'Whether user completed the health questionnaire';
COMMENT ON COLUMN public.profiles.health_conditions IS 'JSON map of condition keys and details';
