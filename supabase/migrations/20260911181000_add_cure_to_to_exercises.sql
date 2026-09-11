-- =============================================================================
-- Migration: Add cure_to column (TEXT[]) to public.exercises table
-- Description: Stores array of health/posture condition keys that the exercise helps treat
-- =============================================================================

ALTER TABLE public.exercises
ADD COLUMN IF NOT EXISTS cure_to TEXT[] DEFAULT '{}'::TEXT[];

-- Create GIN index for fast array containment and overlap queries
CREATE INDEX IF NOT EXISTS idx_exercises_cure_to ON public.exercises USING GIN (cure_to);

-- Seed/Update cure_to for all existing exercises
UPDATE public.exercises
SET cure_to = ARRAY['knock_knees', 'bow_legs', 'flat_feet']
WHERE LOWER(name) LIKE '%squat%';

UPDATE public.exercises
SET cure_to = ARRAY['bow_legs', 'lower_back_pain', 'rounded_shoulders']
WHERE LOWER(name) LIKE '%triangle%';

UPDATE public.exercises
SET cure_to = ARRAY['knock_knees', 'bow_legs', 'flat_feet']
WHERE LOWER(name) LIKE '%lunge%';

UPDATE public.exercises
SET cure_to = ARRAY['bow_legs', 'lower_back_pain']
WHERE LOWER(name) LIKE '%crunch%';

UPDATE public.exercises
SET cure_to = ARRAY['lower_back_pain']
WHERE LOWER(name) LIKE '%sit-up%' OR LOWER(name) LIKE '%sit up%';

UPDATE public.exercises
SET cure_to = ARRAY['bow_legs', 'flat_feet', 'lower_back_pain', 'rounded_shoulders']
WHERE LOWER(name) LIKE '%cobra%';

UPDATE public.exercises
SET cure_to = ARRAY['flat_feet', 'lower_back_pain', 'rounded_shoulders']
WHERE LOWER(name) LIKE '%push-up%' OR LOWER(name) LIKE '%pushup%';
