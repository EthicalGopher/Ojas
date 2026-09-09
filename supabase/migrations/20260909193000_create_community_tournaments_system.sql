-- =============================================================================
-- Migration: Add Admin / Calorie Columns & Create Tournament Battle System
-- =============================================================================

-- 1. Ensure profiles table has admin, is_admin, and daily_calories columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS daily_calories JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS total_calories NUMERIC DEFAULT 0;

-- 2. Create Tournaments Table
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    exercise_id TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'single_elimination' CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'best_of_three')),
    status TEXT NOT NULL DEFAULT 'registration_open' CHECK (status IN ('upcoming', 'registration_open', 'in_progress', 'completed', 'cancelled')),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    creator_username TEXT,
    max_communities INTEGER NOT NULL DEFAULT 8,
    athletes_per_match INTEGER NOT NULL DEFAULT 1,
    prize_pool TEXT DEFAULT '🏆 Grand Trophy & Leaderboard Glory',
    banner_url TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    total_rounds INTEGER NOT NULL DEFAULT 3,
    winner_community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
    winner_community_name TEXT,
    winner_community_logo TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create Tournament Entries Table (Communities registered by Leaders)
CREATE TABLE IF NOT EXISTS public.tournament_entries (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    community_name TEXT NOT NULL,
    community_logo TEXT,
    leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    leader_username TEXT,
    seed INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'eliminated', 'champion')),
    selected_athletes JSONB NOT NULL DEFAULT '[]'::jsonb,
    score_total NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_tourn_community UNIQUE (tournament_id, community_id)
);

-- 4. Create Tournament Matches Table (Bracket Elimination Tree)
CREATE TABLE IF NOT EXISTS public.tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL DEFAULT 1,
    round_name TEXT NOT NULL,
    match_order INTEGER NOT NULL DEFAULT 1,
    
    community1_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
    community1_name TEXT,
    community1_logo TEXT,
    community1_athlete_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    community1_athlete_name TEXT,
    community1_score NUMERIC DEFAULT 0,
    
    community2_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
    community2_name TEXT,
    community2_logo TEXT,
    community2_athlete_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    community2_athlete_name TEXT,
    community2_score NUMERIC DEFAULT 0,
    
    winner_community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
    winner_community_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'bye')),
    exercise_id TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON public.tournaments(created_by);
CREATE INDEX IF NOT EXISTS idx_tourn_entries_tourn ON public.tournament_entries(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tourn_entries_comm ON public.tournament_entries(community_id);
CREATE INDEX IF NOT EXISTS idx_tourn_matches_tourn ON public.tournament_matches(tournament_id, round_number);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for Tournaments
DROP POLICY IF EXISTS "Tournaments viewable by everyone" ON public.tournaments;
CREATE POLICY "Tournaments viewable by everyone"
ON public.tournaments FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins can create tournaments" ON public.tournaments;
CREATE POLICY "Admins can create tournaments"
ON public.tournaments FOR INSERT
TO authenticated
WITH CHECK (
    (select auth.uid()) = created_by OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
);

DROP POLICY IF EXISTS "Admins and creators can update tournaments" ON public.tournaments;
CREATE POLICY "Admins and creators can update tournaments"
ON public.tournaments FOR UPDATE
TO authenticated
USING (
    (select auth.uid()) = created_by OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
)
WITH CHECK (
    (select auth.uid()) = created_by OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
);

-- 8. RLS Policies for Tournament Entries
DROP POLICY IF EXISTS "Entries viewable by everyone" ON public.tournament_entries;
CREATE POLICY "Entries viewable by everyone"
ON public.tournament_entries FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Leaders and Admins can register entries" ON public.tournament_entries;
CREATE POLICY "Leaders and Admins can register entries"
ON public.tournament_entries FOR INSERT
TO authenticated
WITH CHECK (
    (select auth.uid()) = leader_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = tournament_entries.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
);

DROP POLICY IF EXISTS "Leaders and Admins can update entries" ON public.tournament_entries;
CREATE POLICY "Leaders and Admins can update entries"
ON public.tournament_entries FOR UPDATE
TO authenticated
USING (
    (select auth.uid()) = leader_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = tournament_entries.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
)
WITH CHECK (
    (select auth.uid()) = leader_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = tournament_entries.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    ) OR
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND (p.admin = true OR p.is_admin = true)
    )
);

-- 9. RLS Policies for Tournament Matches
DROP POLICY IF EXISTS "Matches viewable by everyone" ON public.tournament_matches;
CREATE POLICY "Matches viewable by everyone"
ON public.tournament_matches FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins and Match Participants can update matches" ON public.tournament_matches;
CREATE POLICY "Admins and Match Participants can update matches"
ON public.tournament_matches FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = tournament_matches.tournament_id
          AND (t.created_by = (select auth.uid()) OR EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = (select auth.uid()) AND (p.admin = true OR p.is_admin = true)
          ))
    ) OR
    (select auth.uid()) = community1_athlete_id OR
    (select auth.uid()) = community2_athlete_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE (cm.community_id = tournament_matches.community1_id OR cm.community_id = tournament_matches.community2_id)
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.tournaments t
        WHERE t.id = tournament_matches.tournament_id
          AND (t.created_by = (select auth.uid()) OR EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = (select auth.uid()) AND (p.admin = true OR p.is_admin = true)
          ))
    ) OR
    (select auth.uid()) = community1_athlete_id OR
    (select auth.uid()) = community2_athlete_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE (cm.community_id = tournament_matches.community1_id OR cm.community_id = tournament_matches.community2_id)
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
    )
);

-- 10. Grant public and authenticated permissions
GRANT ALL ON public.tournaments TO authenticated, anon;
GRANT ALL ON public.tournament_entries TO authenticated, anon;
GRANT ALL ON public.tournament_matches TO authenticated, anon;
