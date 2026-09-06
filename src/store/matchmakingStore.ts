import { create } from 'zustand';
import type { QueueCounts } from '../utils/matchmaking';

const DEFAULT_EXERCISE_COUNTS: Record<string, number> = {
  '1': 0,
  '2': 0,
  '3': 0,
  '4': 0,
  '5': 0,
  '6': 0,
  '7': 0,
  '8': 0,
};

export const DEFAULT_QUEUE_COUNTS: QueueCounts = {
  total_online: 0,
  exercise_counts: DEFAULT_EXERCISE_COUNTS,
};

interface MatchmakingState extends QueueCounts {
  autoRematch: boolean;
  setAutoRematch: (enabled: boolean) => void;
  toggleAutoRematch: () => void;
  setCounts: (counts: QueueCounts) => void;
  resetCounts: () => void;
}

export const useMatchmakingStore = create<MatchmakingState>((set) => ({
  ...DEFAULT_QUEUE_COUNTS,
  autoRematch: true,
  setAutoRematch: (autoRematch) => set({ autoRematch }),
  toggleAutoRematch: () => set((state) => ({ autoRematch: !state.autoRematch })),
  setCounts: (counts) => set({
    total_online: counts.total_online,
    exercise_counts: {
      ...DEFAULT_EXERCISE_COUNTS,
      ...counts.exercise_counts,
    },
  }),
  resetCounts: () => set({
    ...DEFAULT_QUEUE_COUNTS,
    exercise_counts: { ...DEFAULT_EXERCISE_COUNTS },
  }),
}));
