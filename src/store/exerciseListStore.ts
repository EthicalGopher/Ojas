import { create } from 'zustand';
import { DEFAULT_EXERCISES, ExerciseItem } from '../utils/exerciseService';

/**
 * The exercise list, shared so the lobby, Feed, Train and the camera screens' quest checks all use
 * the same list (quests are picked by exercise name, so different lists can give different quests).
 */
interface ExerciseListState {
  exercises: ExerciseItem[];
  setExercises: (list: ExerciseItem[]) => void;
}

export const useExerciseListStore = create<ExerciseListState>((set) => ({
  exercises: DEFAULT_EXERCISES,
  setExercises: (exercises) => set({ exercises }),
}));
