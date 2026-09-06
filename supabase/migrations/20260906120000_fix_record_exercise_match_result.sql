-- =============================================================================
-- Migration: Fix record_exercise_match_result RPC function
-- Fixes error: column "total_squats" does not exist in profiles table
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

    -- Upsert per-exercise stats into user_exercise_stats
    INSERT INTO public.user_exercise_stats (
        user_id,
        exercise_id,
        points,
        matches_played,
        matches_won,
        matches_drawn,
        matches_lost,
        reps_completed,
        updated_at
    )
    VALUES (
        p_user_id,
        p_exercise_id,
        GREATEST(0, v_pts_delta),
        1,
        v_won_inc,
        v_drawn_inc,
        v_lost_inc,
        GREATEST(0, p_reps),
        NOW()
    )
    ON CONFLICT (user_id, exercise_id) DO UPDATE SET
        points = GREATEST(0, public.user_exercise_stats.points + v_pts_delta),
        matches_played = public.user_exercise_stats.matches_played + 1,
        matches_won = public.user_exercise_stats.matches_won + v_won_inc,
        matches_drawn = public.user_exercise_stats.matches_drawn + v_drawn_inc,
        matches_lost = public.user_exercise_stats.matches_lost + v_lost_inc,
        reps_completed = public.user_exercise_stats.reps_completed + GREATEST(0, p_reps),
        updated_at = NOW()
    RETURNING * INTO v_stats;

    RETURN v_stats;
END;
$$;

-- Grant execution to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.record_exercise_match_result(UUID, TEXT, TEXT, INTEGER) TO authenticated, anon;
