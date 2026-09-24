-- =============================================================================
-- Ojas: apply everything the live database is missing (safe to run more than once).
-- Paste into Supabase Dashboard -> SQL Editor -> Run.
-- Checked 2026-09-24: profiles.daily_challenges, profiles.admin,
-- profiles.news_last_seen_at and the news table were missing.
-- =============================================================================

-- From 20260912094500_add_daily_challenges_to_profiles.sql
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS daily_challenges JSONB DEFAULT '{}'::jsonb;

-- From 20260909193000_create_community_tournaments_system.sql (column only)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE;

-- From 20260924120000_create_news_system.sql
-- =============================================================================
-- Migration: Admin news / announcements system
-- Admins are profiles with is_admin = true. Everyone can read news; only admins
-- can publish, edit, pin or delete it.
-- =============================================================================

-- 1. Make sure the admin flag exists, and track when each user last opened the
--    news feed (drives the unread badge)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS news_last_seen_at TIMESTAMPTZ;

-- 2. Stop regular users from granting themselves admin.
-- The "Users can update their own profile" policy lets a user update every
-- column of their own row, including is_admin. Only privileged roles
-- (SQL editor / service_role) may change the flag; for app users it is kept as-is.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_admin := FALSE;
    ELSE
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_flag ON public.profiles;
CREATE TRIGGER protect_profile_admin_flag
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_flag();

-- 3. Helper used by RLS policies (SECURITY DEFINER so it can read profiles cheaply)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = (select auth.uid())),
    FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- 4. News table
CREATE TABLE IF NOT EXISTS public.news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
    body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
    category TEXT NOT NULL DEFAULT 'update'
      CHECK (category IN ('update', 'event', 'challenge', 'tip', 'alert')),
    image_url TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_feed ON public.news (is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_author ON public.news (author_id);

-- 5. Row Level Security
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "News is viewable by everyone" ON public.news;
CREATE POLICY "News is viewable by everyone"
ON public.news FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins can publish news" ON public.news;
CREATE POLICY "Admins can publish news"
ON public.news FOR INSERT
TO authenticated
WITH CHECK ((select public.is_admin()) AND author_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can edit news" ON public.news;
CREATE POLICY "Admins can edit news"
ON public.news FOR UPDATE
TO authenticated
USING ((select public.is_admin()))
WITH CHECK ((select public.is_admin()));

DROP POLICY IF EXISTS "Admins can delete news" ON public.news;
CREATE POLICY "Admins can delete news"
ON public.news FOR DELETE
TO authenticated
USING ((select public.is_admin()));

-- 6. Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_news_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_news_updated_at ON public.news;
CREATE TRIGGER touch_news_updated_at
  BEFORE UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.touch_news_updated_at();

-- 7. Live updates in the app
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'news'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news;
  END IF;
END;
$$;

-- Make the API pick up the new columns immediately
NOTIFY pgrst, 'reload schema';
