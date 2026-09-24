import { useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import { useDailyChallengeStore } from '../store/dailyChallengeStore';
import { computeStreak, computeTotalXp, levelFromXp } from '../utils/gamification';

/** Level, XP and streak for the signed-in athlete, including unsynced activity from this session. */
export function useGameStats() {
  const profile = useUserStore((s) => s.profile);
  const exerciseProgressToday = useDailyChallengeStore((s) => s.exerciseProgressToday);
  const completedChallengeIds = useDailyChallengeStore((s) => s.completedChallengeIds);

  return useMemo(() => {
    const liveCalories = useDailyChallengeStore.getState().getTodayTotalCalories();
    const liveActiveToday =
      liveCalories > 0 || Object.values(completedChallengeIds).some(Boolean);

    const level = levelFromXp(computeTotalXp(profile, liveCalories));
    const streak = computeStreak(profile, liveActiveToday);
    return { level, streak };
  }, [profile, exerciseProgressToday, completedChallengeIds]);
}
