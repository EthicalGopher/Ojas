-- Clan join settings (Clan > Applications): how join requests are handled and the minimum player level.
--   join_policy: 'approval' (leader or officer reviews each request), 'open' (anyone who qualifies joins at
--                once) or 'closed' (no requests accepted). Invites still work for every policy.
--   min_level:   minimum player level (profile_level) needed to request or join. 1 means any level.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'approval',
  ADD COLUMN IF NOT EXISTS min_level INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_join_policy_check') THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_join_policy_check CHECK (join_policy IN ('approval', 'open', 'closed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_min_level_check') THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_min_level_check CHECK (min_level BETWEEN 1 AND 100);
  END IF;
END $$;

-- Join request now honours the clan's settings. An existing invite to this clan is still accepted as before.
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
    v_community public.communities;
    v_profile public.profiles;
BEGIN
    SELECT * INTO v_current_membership
    FROM public.community_members
    WHERE user_id = p_user_id;

    IF v_current_membership IS NOT NULL THEN
        IF v_current_membership.status = 'active' THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are already an active member of a clan.');
        ELSIF v_current_membership.status = 'pending_approval' THEN
            RETURN jsonb_build_object('success', false, 'error', 'You already have a pending request for a clan.');
        ELSIF v_current_membership.status = 'invited' AND v_current_membership.community_id = p_community_id THEN
            UPDATE public.community_members
            SET status = 'active', joined_at = NOW(), updated_at = NOW()
            WHERE user_id = p_user_id AND community_id = p_community_id;

            UPDATE public.communities
            SET member_count = member_count + 1, updated_at = NOW()
            WHERE id = p_community_id;

            RETURN jsonb_build_object('success', true, 'joined', true, 'message', 'You accepted the invite and joined the clan!');
        ELSE
            DELETE FROM public.community_members WHERE user_id = p_user_id;
        END IF;
    END IF;

    SELECT * INTO v_community FROM public.communities WHERE id = p_community_id;
    IF v_community.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Clan not found.');
    END IF;

    IF v_community.join_policy = 'closed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This clan is not accepting requests right now.');
    END IF;

    IF v_community.min_level > 1 THEN
        SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
        IF v_profile.id IS NULL OR public.profile_level(v_profile) < v_community.min_level THEN
            RETURN jsonb_build_object('success', false, 'error', format('This clan needs level %s or higher.', v_community.min_level));
        END IF;
    END IF;

    IF v_community.join_policy = 'open' THEN
        INSERT INTO public.community_members (community_id, user_id, role, status)
        VALUES (p_community_id, p_user_id, 'member', 'active');

        UPDATE public.communities
        SET member_count = member_count + 1, updated_at = NOW()
        WHERE id = p_community_id;

        RETURN jsonb_build_object('success', true, 'joined', true, 'message', 'You joined the clan!');
    END IF;

    INSERT INTO public.community_members (community_id, user_id, role, status)
    VALUES (p_community_id, p_user_id, 'member', 'pending_approval');

    RETURN jsonb_build_object('success', true, 'message', 'Join request sent! Waiting for the leader to review it.');
END;
$$;

-- Leader or officer changes the join settings. Uses auth.uid(), not a passed-in id.
CREATE OR REPLACE FUNCTION public.update_clan_settings(
    p_community_id UUID,
    p_join_policy TEXT,
    p_min_level INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sign in to change clan settings.');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.community_members
        WHERE community_id = p_community_id
          AND user_id = v_uid
          AND role IN ('leader', 'admin')
          AND status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only the clan leader or officers can change these settings.');
    END IF;

    IF p_join_policy NOT IN ('approval', 'open', 'closed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unknown join setting.');
    END IF;

    IF p_min_level IS NULL OR p_min_level < 1 OR p_min_level > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Minimum level must be between 1 and 100.');
    END IF;

    UPDATE public.communities
    SET join_policy = p_join_policy, min_level = p_min_level, updated_at = NOW()
    WHERE id = p_community_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_clan_settings(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_clan_settings(UUID, TEXT, INTEGER) TO authenticated;
