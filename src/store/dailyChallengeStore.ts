import { create } from 'zustand';
import { calculateExerciseCalories } from '../utils/calorieService';

export interface ExerciseLiveStats {
  reps: number;
  holdSeconds: number;
  caloriesBurned: number;
}

interface DailyChallengeState {
  completedChallengeIds: Record<string, boolean>; // key: challengeId, value: true
  exerciseProgressToday: Record<string, ExerciseLiveStats>; // key: normalized exercise name or ID
  toggleChallenge: (challengeId: string) => void;
  markChallengeCompleted: (challengeId: string) => void;
  recordExerciseProgress: (exerciseId: string, exerciseName: string, reps: number, holdSeconds?: number) => void;
  addExerciseDelta: (exerciseId: string, exerciseName: string, deltaReps: number, deltaHoldSeconds?: number) => void;
  getExerciseStats: (exerciseId: string, exerciseName: string) => ExerciseLiveStats;
  getTodayTotalCalories: () => number;
  hydrateFromProfile: (dailyChallengesMap?: Record<string, any>, dateStr?: string) => void;
  isChallengeCompleted: (challengeId: string) => boolean;
  clearDailyChallenges: () => void;
}

const normalizeKey = (key: string): string => {
  return (key || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
};

export const useDailyChallengeStore = create<DailyChallengeState>((set, get) => ({
  completedChallengeIds: {},
  exerciseProgressToday: {},

  toggleChallenge: (challengeId: string) => {
    set((state) => {
      const current = !!state.completedChallengeIds[challengeId];
      return {
        completedChallengeIds: {
          ...state.completedChallengeIds,
          [challengeId]: !current,
        },
      };
    });
  },

  markChallengeCompleted: (challengeId: string) => {
    set((state) => ({
      completedChallengeIds: {
        ...state.completedChallengeIds,
        [challengeId]: true,
      },
    }));
  },

  addExerciseDelta: (exerciseId: string, exerciseName: string, deltaReps: number, deltaHoldSeconds: number = 0) => {
    if (deltaReps <= 0 && deltaHoldSeconds <= 0) return;
    set((state) => {
      const idKey = String(exerciseId);
      const nameKey = normalizeKey(exerciseName);

      const existingById = state.exerciseProgressToday[idKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };
      const existingByName = state.exerciseProgressToday[nameKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };

      const baseReps = Math.max(existingById.reps, existingByName.reps);
      const baseHold = Math.max(existingById.holdSeconds, existingByName.holdSeconds);
      const baseCalories = Math.max(existingById.caloriesBurned || 0, existingByName.caloriesBurned || 0);

      const deltaCalories = calculateExerciseCalories(exerciseId || exerciseName, deltaReps, deltaHoldSeconds);

      const updatedStats: ExerciseLiveStats = {
        reps: baseReps + Math.max(0, deltaReps),
        holdSeconds: baseHold + Math.max(0, deltaHoldSeconds),
        caloriesBurned: Math.round((baseCalories + deltaCalories) * 10) / 10,
      };

      return {
        exerciseProgressToday: {
          ...state.exerciseProgressToday,
          [idKey]: updatedStats,
          [nameKey]: updatedStats,
        },
      };
    });
  },

  getExerciseStats: (exerciseId: string, exerciseName: string): ExerciseLiveStats => {
    const state = get();
    const idKey = String(exerciseId);
    const nameKey = normalizeKey(exerciseName);
    const existingById = state.exerciseProgressToday[idKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };
    const existingByName = state.exerciseProgressToday[nameKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };
    const calculatedCalories = calculateExerciseCalories(
      exerciseId || exerciseName,
      Math.max(existingById.reps, existingByName.reps),
      Math.max(existingById.holdSeconds, existingByName.holdSeconds)
    );
    return {
      reps: Math.max(existingById.reps, existingByName.reps),
      holdSeconds: Math.max(existingById.holdSeconds, existingByName.holdSeconds),
      caloriesBurned: Math.max(existingById.caloriesBurned || 0, existingByName.caloriesBurned || 0, calculatedCalories),
    };
  },

  getTodayTotalCalories: (): number => {
    const state = get();
    const processedKeys = new Set<string>();
    let total = 0;

    Object.entries(state.exerciseProgressToday).forEach(([key, stats]) => {
      // Only process numeric id keys to avoid double counting normalized name duplicates
      if (/^\d+$/.test(key) && !processedKeys.has(key)) {
        processedKeys.add(key);
        const cals = stats.caloriesBurned > 0
          ? stats.caloriesBurned
          : calculateExerciseCalories(key, stats.reps, stats.holdSeconds);
        total += cals;
      }
    });

    return Math.round(total * 10) / 10;
  },

  hydrateFromProfile: (dailyChallengesMap?: Record<string, any>, dateStr?: string) => {
    if (!dailyChallengesMap || typeof dailyChallengesMap !== 'object') return;
    const today = dateStr || new Date().toISOString().split('T')[0];
    const todayEntry = dailyChallengesMap[today];
    if (!todayEntry) return;

    set((state) => {
      const mergedProgress = { ...state.exerciseProgressToday };
      if (todayEntry.progress && typeof todayEntry.progress === 'object') {
        Object.entries(todayEntry.progress).forEach(([key, val]: [string, any]) => {
          if (val && typeof val === 'object') {
            const existing = mergedProgress[key] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };
            const reps = Math.max(existing.reps || 0, val.reps || 0);
            const holdSeconds = Math.max(existing.holdSeconds || 0, val.holdSeconds || 0);
            const caloriesBurned = Math.max(
              existing.caloriesBurned || 0,
              val.caloriesBurned || 0,
              calculateExerciseCalories(key, reps, holdSeconds)
            );
            mergedProgress[key] = {
              reps,
              holdSeconds,
              caloriesBurned,
            };
          }
        });
      }

      const mergedCompleted = { ...state.completedChallengeIds };
      if (Array.isArray(todayEntry.completedIds)) {
        todayEntry.completedIds.forEach((id: string) => {
          mergedCompleted[id] = true;
        });
      }

      return {
        exerciseProgressToday: mergedProgress,
        completedChallengeIds: mergedCompleted,
      };
    });
  },

  recordExerciseProgress: (exerciseId: string, exerciseName: string, reps: number, holdSeconds: number = 0) => {
    set((state) => {
      const idKey = String(exerciseId);
      const nameKey = normalizeKey(exerciseName);

      const existingById = state.exerciseProgressToday[idKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };
      const existingByName = state.exerciseProgressToday[nameKey] || { reps: 0, holdSeconds: 0, caloriesBurned: 0 };

      const maxReps = Math.max(existingById.reps, existingByName.reps, reps || 0);
      const maxHold = Math.max(existingById.holdSeconds, existingByName.holdSeconds, holdSeconds || 0);
      const calculatedCalories = calculateExerciseCalories(exerciseId || exerciseName, maxReps, maxHold);

      const updatedStats: ExerciseLiveStats = {
        reps: maxReps,
        holdSeconds: maxHold,
        caloriesBurned: Math.max(existingById.caloriesBurned || 0, existingByName.caloriesBurned || 0, calculatedCalories),
      };

      return {
        exerciseProgressToday: {
          ...state.exerciseProgressToday,
          [idKey]: updatedStats,
          [nameKey]: updatedStats,
        },
      };
    });
  },

  isChallengeCompleted: (challengeId: string) => {
    return !!get().completedChallengeIds[challengeId];
  },

  clearDailyChallenges: () => {
    set({ completedChallengeIds: {}, exerciseProgressToday: {} });
  },
}));
