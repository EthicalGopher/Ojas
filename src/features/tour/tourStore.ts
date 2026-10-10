import { View } from 'react-native';
import { create } from 'zustand';

/**
 * Interactive app tour (coach marks). Screens wrap the buttons the tour points at in
 * <TourTarget id="...">, which registers the view here; <CoachMarks> measures the view for the
 * current step and spotlights it.
 */
interface TourState {
  running: boolean;
  step: number;
  targets: Record<string, View | null>;
  register: (id: string, view: View | null) => void;
  unregister: (id: string, view: View | null) => void;
  start: () => void;
  next: () => void;
  stop: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  running: false,
  step: 0,
  targets: {},
  register: (id, view) => set({ targets: { ...get().targets, [id]: view } }),
  unregister: (id, view) => {
    // a remounted screen may already have registered its new view under the same id
    if (get().targets[id] !== view) return;
    const targets = { ...get().targets };
    delete targets[id];
    set({ targets });
  },
  start: () => set({ running: true, step: 0 }),
  next: () => set({ step: get().step + 1 }),
  stop: () => set({ running: false, step: 0 }),
}));
