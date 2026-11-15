-- =============================================================================
-- Migration: match energy (Shadow Fight 2 style) and per-match history
--
-- Energy: every player has ENERGY_MAX (5) bars. Each match uses one; one bar comes back every
-- 10 minutes until the bar is full again. The count lives on profiles and only changes through
-- get_energy() / spend_energy(), so reinstalling the app or editing the profile cannot refill it.
-- Keep the numbers in step with src/utils/energyLogic.ts.
--
-- History: one match_history row per finished match (wins, draws, defeats, forfeits), read by the
-- History tab in Profile. Players can only read and add their own rows.
-- Safe to run more than once.
-- =============================================================================

-- 1. Energy columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS energy SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS energy_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Players may update their own profile row, so a trigger keeps these two columns read-only for
-- them. The energy functions below set ojas.energy_write for their own update.
CREATE OR REPLACE FUNCTION public.protect_profile_energy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('ojas.energy_write', TRUE), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.energy := 5;
    NEW.energy_updated_at := NOW();
  ELSE
    NEW.energy := OLD.energy;
    NEW.energy_updated_at := OLD.energy_updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_energy ON public.profiles;
CREATE TRIGGER profiles_protect_energy
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_energy();

-- Refill: whole 10-minute steps since energy_updated_at, capped at the max. A full bar keeps its
-- clock at "now", so the next refill starts counting only after a match uses a bar.
-- Returns the energy, the clock (start of the current 10-minute step) and the server time.
CREATE OR REPLACE FUNCTION public.get_energy()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max CONSTANT INTEGER := 5;
  v_step CONSTANT INTERVAL := INTERVAL '10 minutes';
  v_energy INTEGER;
  v_at TIMESTAMPTZ;
  v_gained INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT energy, energy_updated_at INTO v_energy, v_at FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN json_build_object('energy', v_max, 'updated_at', NOW(), 'server_now', NOW(), 'max', v_max);
  END IF;

  v_gained := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_at)) / EXTRACT(EPOCH FROM v_step))::INTEGER;
  IF v_gained > 0 THEN
    v_energy := LEAST(v_max, v_energy + v_gained);
    v_at := CASE WHEN v_energy >= v_max THEN NOW() ELSE v_at + v_step * v_gained END;
  END IF;
  IF v_energy >= v_max THEN
    v_at := NOW();
  END IF;

  RETURN json_build_object('energy', v_energy, 'updated_at', v_at, 'server_now', NOW(), 'max', v_max);
END;
$$;

-- Uses one bar for a match that has started. ok = false (nothing changes) when the bar is empty.
CREATE OR REPLACE FUNCTION public.spend_energy()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max CONSTANT INTEGER := 5;
  v_step CONSTANT INTERVAL := INTERVAL '10 minutes';
  v_energy INTEGER;
  v_at TIMESTAMPTZ;
  v_gained INTEGER;
  v_ok BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT energy, energy_updated_at INTO v_energy, v_at
  FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile' USING ERRCODE = 'P0002';
  END IF;

  v_gained := FLOOR(EXTRACT(EPOCH FROM (NOW() - v_at)) / EXTRACT(EPOCH FROM v_step))::INTEGER;
  IF v_gained > 0 THEN
    v_energy := LEAST(v_max, v_energy + v_gained);
    v_at := CASE WHEN v_energy >= v_max THEN NOW() ELSE v_at + v_step * v_gained END;
  END IF;

  IF v_energy >= 1 THEN
    -- a full bar starts its refill clock now
    IF v_energy >= v_max THEN
      v_at := NOW();
    END IF;
    v_energy := v_energy - 1;
    v_ok := TRUE;
  END IF;

  PERFORM set_config('ojas.energy_write', '1', TRUE);
  UPDATE public.profiles SET energy = v_energy, energy_updated_at = v_at WHERE id = auth.uid();
  PERFORM set_config('ojas.energy_write', '', TRUE);

  RETURN json_build_object('ok', v_ok, 'energy', v_energy, 'updated_at', v_at, 'server_now', NOW(), 'max', v_max);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_energy() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.spend_energy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_energy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spend_energy() TO authenticated;

-- 2. Match history
CREATE TABLE IF NOT EXISTS public.match_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('quickjoin', 'ffa', 'ai_battle')),
  opponent TEXT,
  result TEXT NOT NULL CHECK (result IN ('win', 'draw', 'defeat')),
  self_score INTEGER NOT NULL DEFAULT 0 CHECK (self_score BETWEEN 0 AND 10000),
  opponent_score INTEGER CHECK (opponent_score BETWEEN 0 AND 10000),
  points_delta INTEGER NOT NULL DEFAULT 0 CHECK (points_delta BETWEEN -10 AND 10),
  calories INTEGER NOT NULL DEFAULT 0 CHECK (calories BETWEEN 0 AND 10000),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds BETWEEN 0 AND 3600),
  forfeit BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS match_history_user_created_idx
  ON public.match_history (user_id, created_at DESC);

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players read their own match history" ON public.match_history;
CREATE POLICY "Players read their own match history"
  ON public.match_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Players add their own match history" ON public.match_history;
CREATE POLICY "Players add their own match history"
  ON public.match_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.match_history FROM anon;
GRANT SELECT, INSERT ON public.match_history TO authenticated;
