import { useEffect, useRef } from 'react';
import { useExerciseListStore } from '../store/exerciseListStore';
import { juice } from '../juice/juice';
import { useDailyChallenges } from './useDailyChallenges';

/**
 * Plays `quest_done` when a daily quest completes during a camera session. Quest completion is derived
 * from progress and the store is filled asynchronously at login, so this only compares against a
 * baseline taken when the camera screen mounted (wired into the camera screens in phase 2).
 */
export function useQuestDoneJuice(): void {
  const exercises = useExerciseListStore((s) => s.exercises);
  const { challenges } = useDailyChallenges(exercises);
  const baseline = useRef<Set<string> | null>(null);

  useEffect(() => {
    const done = challenges.filter((c) => c.isCompleted).map((c) => c.id);
    if (baseline.current === null) {
      baseline.current = new Set(done);
      return;
    }
    for (const id of done) {
      if (!baseline.current.has(id)) {
        baseline.current.add(id);
        juice.play('quest_done');
      }
    }
  }, [challenges]);
}
