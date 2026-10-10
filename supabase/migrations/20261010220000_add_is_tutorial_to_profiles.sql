-- Migration: Add is_tutorial flag to public.profiles
-- true  = the user finished or skipped the first-run tutorial (don't show it)
-- false = show the tutorial (the default for every new profile)
-- The app sets it to true when the tutorial is completed or skipped; Profile -> Settings ->
-- "Replay tutorial" shows it again without changing the flag.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_tutorial'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN is_tutorial BOOLEAN NOT NULL DEFAULT FALSE;

    -- The tutorial is for new users: everyone who already has a profile is marked as done.
    -- Only on first creation, so running this file again never hides it from new users.
    UPDATE public.profiles SET is_tutorial = TRUE;
  END IF;
END $$;
