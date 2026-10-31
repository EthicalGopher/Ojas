-- =============================================================================
-- Migration: Require the caller to be the user whose stats are written
-- Fixes: record_exercise_match_result was SECURITY DEFINER, granted to anon and
--        trusted p_user_id, so anyone could rewrite any user's stats.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_exercise_match_result(
    p_user_id UUID,
    p_exercise_id TEXT,
    p_result TEXT,
    p_reps INTEGER DEFAULT 0
)
RETURNS public.user_exercise_stats
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stats public.user_exercise_stats;
    v_pts_delta INTEGER := 0;
    v_won_inc INTEGER := 0;
    v_drawn_inc INTEGER := 0;
    v_lost_inc INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
        RAISE EXCEPTION 'not authorized to record results for this user'
            USING ERRCODE = '42501';
    END IF;

    IF p_result = 'win' THEN
        v_pts_delta := 10;
        v_won_inc := 1;
    ELSIF p_result = 'draw' THEN
        v_pts_delta := 5;
        v_drawn_inc := 1;
    ELSIF p_result = 'defeat' OR p_result = 'loss' THEN
        v_pts_delta := -10;
        v_lost_inc := 1;
    END IF;

    INSERT INTO public.user_exercise_stats (
        user_id, exercise_id, points, matches_played, matches_won,
        matches_drawn, matches_lost, reps_completed, updated_at
    )
    VALUES (
        p_user_id, p_exercise_id, GREATEST(0, v_pts_delta), 1, v_won_inc,
        v_drawn_inc, v_lost_inc, LEAST(GREATEST(0, p_reps), 1000), NOW()
    )
    ON CONFLICT (user_id, exercise_id) DO UPDATE SET
        points = GREATEST(0, public.user_exercise_stats.points + v_pts_delta),
        matches_played = public.user_exercise_stats.matches_played + 1,
        matches_won = public.user_exercise_stats.matches_won + v_won_inc,
        matches_drawn = public.user_exercise_stats.matches_drawn + v_drawn_inc,
        matches_lost = public.user_exercise_stats.matches_lost + v_lost_inc,
        reps_completed = public.user_exercise_stats.reps_completed + LEAST(GREATEST(0, p_reps), 1000),
        updated_at = NOW()
    RETURNING * INTO v_stats;

    RETURN v_stats;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_exercise_match_result(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_exercise_match_result(UUID, TEXT, TEXT, INTEGER) TO authenticated;
