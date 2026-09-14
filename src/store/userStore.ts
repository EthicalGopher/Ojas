import { create } from 'zustand';
import { supabase } from '../utils/supabase';
import { UserProfile, getOrCreateUserProfile } from '../utils/profileService';
import { useDailyChallengeStore } from './dailyChallengeStore';

export type MainTab = 'home' | 'explore' | 'workouts' | 'social' | 'profile';

export interface MatchSummaryStats {
  exerciseId: string;
  exerciseName?: string;
  reps: number;
  calories: number;
  durationSeconds: number;
  result: 'win' | 'draw' | 'defeat';
  pointsEarned: number;
  mode: 'faceoff' | 'quickjoin' | 'ffa' | 'ai_battle';
  opponentUsername?: string;
  aiQuote?: string;
  botLevel?: number;
}

interface UserState {
  user: any | null;
  profile: UserProfile | null;
  activeTab: MainTab;
  selectedExerciseId: string | null;
  isGuest: boolean;
  lastMatchSummary: MatchSummaryStats | null;
  setUser: (user: any | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setActiveTab: (tab: MainTab) => void;
  setSelectedExerciseId: (id: string | null) => void;
  setIsGuest: (isGuest: boolean) => void;
  setLastMatchSummary: (summary: MatchSummaryStats | null) => void;
  refreshProfile: () => Promise<UserProfile | null>;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  profile: null,
  activeTab: 'home',
  selectedExerciseId: null,
  isGuest: false,
  lastMatchSummary: null,
  setUser: (user) => {
    set({ user, isGuest: user?.isGuest || false });
    if (user && !user?.isGuest) {
      get().refreshProfile();
    } else if (user?.isGuest) {
      set({
        profile: {
          id: 'guest',
          username: 'Guest Athlete',
          full_name: 'Guest Athlete',
          avatar_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          fitness_goal: 'Offline Training',
          preferred_complexity: 'medium',
          total_matches_played: 0,
          total_matches_won: 0,
          total_points: 0,
          ranking_tier: 'Rookie',
        } as any,
      });
    } else {
      set({ profile: null });
    }
  },
  setProfile: (profile) => {
    set({ profile });
    if (profile?.daily_challenges) {
      useDailyChallengeStore.getState().hydrateFromProfile(profile.daily_challenges);
    }
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedExerciseId: (selectedExerciseId) => set({ selectedExerciseId }),
  setIsGuest: (isGuest) => set({ isGuest }),
  setLastMatchSummary: (lastMatchSummary) => set({ lastMatchSummary }),
  refreshProfile: async () => {
    const { user, isGuest } = get();
    if (!user || isGuest) return null;
    try {
      const profileData = await getOrCreateUserProfile(user);
      set({ profile: profileData });
      if (profileData?.daily_challenges) {
        useDailyChallengeStore.getState().hydrateFromProfile(profileData.daily_challenges);
      }
      return profileData;
    } catch (e) {
      return null;
    }
  },
}));
