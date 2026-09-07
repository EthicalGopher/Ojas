-- =============================================================================
-- Migration: Create Communities, Memberships, Join Proposals, and Invites
-- =============================================================================

-- 1. Create communities table
CREATE TABLE IF NOT EXISTS public.communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    logo_url TEXT,
    category TEXT DEFAULT 'School' NOT NULL, -- e.g. 'School', 'Gym', 'Club', 'University', 'Workplace'
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    member_count INTEGER DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create community_members table (one community per user constraint)
CREATE TABLE IF NOT EXISTS public.community_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('leader', 'admin', 'member')) DEFAULT 'member',
    status TEXT NOT NULL CHECK (status IN ('active', 'pending_approval', 'invited')) DEFAULT 'active',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- RULE: Each user can only belong to (or have an active/pending status in) ONE community at a time
    CONSTRAINT unique_user_community UNIQUE (user_id)
);

-- 3. Indexes for rapid lookups and filters
CREATE INDEX IF NOT EXISTS idx_communities_name ON public.communities(name);
CREATE INDEX IF NOT EXISTS idx_communities_category ON public.communities(category);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON public.community_members(community_id, status);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON public.community_members(user_id, status);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 5. RLS Policies for Communities
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Communities are viewable by everyone" ON public.communities;
CREATE POLICY "Communities are viewable by everyone"
ON public.communities FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Authenticated users can create communities" ON public.communities;
CREATE POLICY "Authenticated users can create communities"
ON public.communities FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Community leaders can update their community" ON public.communities;
CREATE POLICY "Community leaders can update their community"
ON public.communities FOR UPDATE
TO authenticated
USING (
    (select auth.uid()) = created_by OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.communities.id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    )
)
WITH CHECK (
    (select auth.uid()) = created_by OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.communities.id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    )
);

DROP POLICY IF EXISTS "Community creators can delete their community" ON public.communities;
CREATE POLICY "Community creators can delete their community"
ON public.communities FOR DELETE
TO authenticated
USING ((select auth.uid()) = created_by);

-- -----------------------------------------------------------------------------
-- 6. RLS Policies for Community Members
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Community members viewable by authenticated users" ON public.community_members;
CREATE POLICY "Community members viewable by authenticated users"
ON public.community_members FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Users can request to join or leaders can insert" ON public.community_members;
CREATE POLICY "Users can request to join or leaders can insert"
ON public.community_members FOR INSERT
TO authenticated
WITH CHECK (
    -- User requesting for themselves
    (select auth.uid()) = user_id OR
    -- Or leader/admin inviting someone
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.community_members.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    ) OR
    -- Or community creator adding themselves
    EXISTS (
        SELECT 1 FROM public.communities c
        WHERE c.id = public.community_members.community_id
          AND c.created_by = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users or leaders can update membership status" ON public.community_members;
CREATE POLICY "Users or leaders can update membership status"
ON public.community_members FOR UPDATE
TO authenticated
USING (
    -- User accepting an invite for themselves
    (select auth.uid()) = user_id OR
    -- Or leader approving / rejecting proposals
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.community_members.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    )
)
WITH CHECK (
    (select auth.uid()) = user_id OR
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.community_members.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    )
);

DROP POLICY IF EXISTS "Users can leave or leaders can kick members" ON public.community_members;
CREATE POLICY "Users can leave or leaders can kick members"
ON public.community_members FOR DELETE
TO authenticated
USING (
    -- User leaving their own community / canceling proposal
    (select auth.uid()) = user_id OR
    -- Leader kicking a member
    EXISTS (
        SELECT 1 FROM public.community_members cm
        WHERE cm.community_id = public.community_members.community_id
          AND cm.user_id = (select auth.uid())
          AND cm.role IN ('leader', 'admin')
          AND cm.status = 'active'
    )
);

-- -----------------------------------------------------------------------------
-- 7. Helper RPCs for Secure Atomic Community Operations
-- -----------------------------------------------------------------------------

-- Create community RPC
CREATE OR REPLACE FUNCTION public.create_community_with_leader(
    p_name TEXT,
    p_description TEXT,
    p_logo_url TEXT,
    p_category TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_membership UUID;
    v_slug TEXT;
    v_community_id UUID;
BEGIN
    -- Check if user is already in any active or pending community
    SELECT id INTO v_existing_membership
    FROM public.community_members
    WHERE user_id = p_user_id AND status IN ('active', 'pending_approval');

    IF v_existing_membership IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'You already belong to a community. You must leave your current community first.'
        );
    END IF;

    -- Generate unique slug
    v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(gen_random_uuid()::text from 1 for 6);

    -- Insert community
    INSERT INTO public.communities (name, slug, description, logo_url, category, created_by, member_count)
    VALUES (trim(p_name), v_slug, COALESCE(p_description, ''), p_logo_url, COALESCE(p_category, 'School'), p_user_id, 1)
    RETURNING id INTO v_community_id;

    -- Delete any old invited/rejected records if present
    DELETE FROM public.community_members WHERE user_id = p_user_id;

    -- Insert leader membership
    INSERT INTO public.community_members (community_id, user_id, role, status, joined_at)
    VALUES (v_community_id, p_user_id, 'leader', 'active', NOW());

    RETURN jsonb_build_object(
        'success', true,
        'community_id', v_community_id,
        'message', 'Community created successfully!'
    );
END;
$$;

-- Propose to Join (or Request Join) RPC
CREATE OR REPLACE FUNCTION public.request_to_join_community(
    p_community_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_membership RECORD;
BEGIN
    -- Check existing membership status
    SELECT * INTO v_current_membership
    FROM public.community_members
    WHERE user_id = p_user_id;

    IF v_current_membership IS NOT NULL THEN
        IF v_current_membership.status = 'active' THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are already an active member of a community.');
        ELSIF v_current_membership.status = 'pending_approval' THEN
            RETURN jsonb_build_object('success', false, 'error', 'You already have a pending proposal for a community.');
        ELSIF v_current_membership.status = 'invited' AND v_current_membership.community_id = p_community_id THEN
            -- Accept the existing invitation!
            UPDATE public.community_members
            SET status = 'active', joined_at = NOW(), updated_at = NOW()
            WHERE user_id = p_user_id AND community_id = p_community_id;

            UPDATE public.communities
            SET member_count = member_count + 1, updated_at = NOW()
            WHERE id = p_community_id;

            RETURN jsonb_build_object('success', true, 'message', 'You accepted the invite and joined the community!');
        ELSE
            -- Clean up old invited records for different community
            DELETE FROM public.community_members WHERE user_id = p_user_id;
        END IF;
    END IF;

    -- Insert proposal
    INSERT INTO public.community_members (community_id, user_id, role, status)
    VALUES (p_community_id, p_user_id, 'member', 'pending_approval');

    RETURN jsonb_build_object('success', true, 'message', 'Join proposal submitted! Awaiting leader approval.');
END;
$$;

-- Leader Invite User by Username RPC
CREATE OR REPLACE FUNCTION public.invite_user_to_community_by_username(
    p_community_id UUID,
    p_leader_id UUID,
    p_target_username TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_leader BOOLEAN;
    v_target_user RECORD;
    v_target_membership RECORD;
BEGIN
    -- Check if requester is leader or admin of this community
    SELECT EXISTS (
        SELECT 1 FROM public.community_members
        WHERE community_id = p_community_id
          AND user_id = p_leader_id
          AND role IN ('leader', 'admin')
          AND status = 'active'
    ) INTO v_is_leader;

    IF NOT v_is_leader THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only community leaders or admins can invite members.');
    END IF;

    -- Find target user by username (case-insensitive)
    SELECT * INTO v_target_user
    FROM public.profiles
    WHERE lower(username) = lower(trim(p_target_username));

    IF v_target_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'User @' || p_target_username || ' not found.');
    END IF;

    -- Check if target user is already in a community
    SELECT * INTO v_target_membership
    FROM public.community_members
    WHERE user_id = v_target_user.id;

    IF v_target_membership IS NOT NULL THEN
        IF v_target_membership.status = 'active' THEN
            IF v_target_membership.community_id = p_community_id THEN
                RETURN jsonb_build_object('success', false, 'error', '@' || p_target_username || ' is already a member.');
            ELSE
                RETURN jsonb_build_object('success', false, 'error', '@' || p_target_username || ' already belongs to another community.');
            END IF;
        ELSIF v_target_membership.status = 'invited' AND v_target_membership.community_id = p_community_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'An invite has already been sent to @' || p_target_username || '.');
        ELSIF v_target_membership.status = 'pending_approval' AND v_target_membership.community_id = p_community_id THEN
            -- Directly accept their proposal!
            UPDATE public.community_members
            SET status = 'active', joined_at = NOW(), updated_at = NOW()
            WHERE user_id = v_target_user.id AND community_id = p_community_id;

            UPDATE public.communities
            SET member_count = member_count + 1, updated_at = NOW()
            WHERE id = p_community_id;

            RETURN jsonb_build_object('success', true, 'message', '@' || p_target_username || ' had a pending proposal and has now been added!');
        ELSE
            -- Delete old stale record
            DELETE FROM public.community_members WHERE user_id = v_target_user.id;
        END IF;
    END IF;

    -- Insert invitation
    INSERT INTO public.community_members (community_id, user_id, role, status)
    VALUES (p_community_id, v_target_user.id, 'member', 'invited');

    RETURN jsonb_build_object('success', true, 'message', 'Invitation sent to @' || v_target_user.username || '!');
END;
$$;

-- Leader Accept or Reject Join Proposal RPC
CREATE OR REPLACE FUNCTION public.review_community_join_proposal(
    p_community_id UUID,
    p_leader_id UUID,
    p_target_user_id UUID,
    p_decision TEXT -- 'accept' or 'reject'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_leader BOOLEAN;
    v_proposal RECORD;
BEGIN
    -- Check if requester is leader or admin of this community
    SELECT EXISTS (
        SELECT 1 FROM public.community_members
        WHERE community_id = p_community_id
          AND user_id = p_leader_id
          AND role IN ('leader', 'admin')
          AND status = 'active'
    ) INTO v_is_leader;

    IF NOT v_is_leader THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only community leaders or admins can review proposals.');
    END IF;

    -- Fetch the pending proposal
    SELECT * INTO v_proposal
    FROM public.community_members
    WHERE community_id = p_community_id
      AND user_id = p_target_user_id
      AND status = 'pending_approval';

    IF v_proposal IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No pending proposal found for this user.');
    END IF;

    IF p_decision = 'accept' THEN
        UPDATE public.community_members
        SET status = 'active', joined_at = NOW(), updated_at = NOW()
        WHERE id = v_proposal.id;

        UPDATE public.communities
        SET member_count = member_count + 1, updated_at = NOW()
        WHERE id = p_community_id;

        RETURN jsonb_build_object('success', true, 'message', 'Proposal accepted! Member added to community.');
    ELSE
        DELETE FROM public.community_members
        WHERE id = v_proposal.id;

        RETURN jsonb_build_object('success', true, 'message', 'Proposal rejected.');
    END IF;
END;
$$;

-- Leader Kick Member or User Leave Community RPC
CREATE OR REPLACE FUNCTION public.remove_community_member(
    p_community_id UUID,
    p_requester_id UUID,
    p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_leader BOOLEAN;
    v_target_member RECORD;
    v_is_self BOOLEAN;
    v_community RECORD;
    v_next_leader_id UUID;
BEGIN
    v_is_self := (p_requester_id = p_target_user_id);

    SELECT * INTO v_community
    FROM public.communities
    WHERE id = p_community_id;

    IF v_community IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Community not found.');
    END IF;

    -- Fetch target member
    SELECT * INTO v_target_member
    FROM public.community_members
    WHERE community_id = p_community_id
      AND user_id = p_target_user_id;

    IF v_target_member IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Member not found in this community.');
    END IF;

    IF NOT v_is_self THEN
        -- Leader kicking member: verify requester is leader/admin
        SELECT EXISTS (
            SELECT 1 FROM public.community_members
            WHERE community_id = p_community_id
              AND user_id = p_requester_id
              AND role IN ('leader', 'admin')
              AND status = 'active'
        ) INTO v_is_leader;

        IF NOT v_is_leader THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission denied. Only leaders/admins can remove members.');
        END IF;

        IF v_target_member.role = 'leader' AND v_community.created_by = p_target_user_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'The primary community leader cannot be removed.');
        END IF;
    ELSE
        -- Self leaving: If leader and other members exist, promote another member
        IF v_target_member.role = 'leader' THEN
            SELECT id INTO v_next_leader_id
            FROM public.community_members
            WHERE community_id = p_community_id
              AND user_id <> p_target_user_id
              AND status = 'active'
            ORDER BY joined_at ASC
            LIMIT 1;

            IF v_next_leader_id IS NOT NULL THEN
                UPDATE public.community_members
                SET role = 'leader'
                WHERE id = v_next_leader_id;
            END IF;
        END IF;
    END IF;

    -- Remove member record
    DELETE FROM public.community_members
    WHERE id = v_target_member.id;

    -- If the member was active, decrement member_count
    IF v_target_member.status = 'active' THEN
        UPDATE public.communities
        SET member_count = GREATEST(0, member_count - 1), updated_at = NOW()
        WHERE id = p_community_id;
    END IF;

    -- If no active members remain, delete the community
    IF (SELECT count(*) FROM public.community_members WHERE community_id = p_community_id AND status = 'active') = 0 THEN
        DELETE FROM public.communities WHERE id = p_community_id;
        RETURN jsonb_build_object('success', true, 'message', 'Left community and closed it as last member.');
    END IF;

    IF v_is_self THEN
        RETURN jsonb_build_object('success', true, 'message', 'You have left the community.');
    ELSE
        RETURN jsonb_build_object('success', true, 'message', 'Member removed from community.');
    END IF;
END;
$$;
