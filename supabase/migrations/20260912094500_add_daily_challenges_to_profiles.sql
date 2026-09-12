-- Migration: Add daily_challenges column to public.profiles table
-- Stores daily challenge completion state and AI-tracked exercise progress per date
-- e.g. { "2026-09-12": { "completedIds": ["daily_2026-09-12_8_lower_back_pain"], "progress": { "8": { "reps": 0, "holdSeconds": 60 } } } }

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS daily_challenges JSONB DEFAULT '{}'::jsonb;
