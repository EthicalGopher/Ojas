import { useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import { useDailyChallengeStore } from '../store/dailyChallengeStore';
import { generateDailyChallenges, type DailyChallengeSummary } from '../utils/dailyChallengeService';
import type { ExerciseItem } from '../utils/exerciseService';

/** Today's (or `dateString`'s) 3 daily challenges with live progress, for the signed-in profile. */
export function useDailyChallenges(exercises: ExerciseItem[], dateString?: string): DailyChallengeSummary {
  const profile = useUserStore((s) => s.profile);
  const completedChallengeIds = useDailyChallengeStore((s) => s.completedChallengeIds);
  const exerciseProgressToday = useDailyChallengeStore((s) => s.exerciseProgressToday);

  return useMemo(
    () => generateDailyChallenges(exercises, profile, dateString, completedChallengeIds, exerciseProgressToday),
    [exercises, profile, dateString, completedChallengeIds, exerciseProgressToday]
  );
}
