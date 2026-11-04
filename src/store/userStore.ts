import { create } from 'zustand';
import { supabase } from '../utils/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, getOrCreateUserProfile, markTutorialDone } from '../utils/profileService';

/** Guests have no profile row, so their tutorial flag lives on the device. */
const GUEST_TUTORIAL_KEY = 'ojas_guest_tutorial_done';
import { useDailyChallengeStore } from './dailyChallengeStore';
import { SavedLook, resolveProfile } from './profileMerge';

/** The hero last confirmed for this player, so a restart shows it before the server answers. */
const savedLookKey = (userId: string) => `ojas_saved_look_${userId}`;
const PROFILE_RETRY_MS = [3000, 10000, 30000];
let profileRetries = 0;
let profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
let latestProfileRead = 0;
const cancelProfileRetry = () => {
  if (profileRetryTimer) clearTimeout(profileRetryTimer);
  profileRetryTimer = null;
};

export type MainTab = 'home' | 'explore' | 'workouts' | 'shop' | 'social' | 'profile';
export type ShopFilter = 'all' | 'owned';
export type HomeSubTab = 'lobby' | 'news';
/** Where a camera/match session was started from; sessions from the lobby return to the lobby. */
export type SessionOrigin = 'lobby' | 'train' | 'detail' | 'other';

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
  homeSubTab: HomeSubTab;
  selectedExerciseId: string | null;
  isGuest: boolean;
  lastMatchSummary: MatchSummaryStats | null;
  shopFilter: ShopFilter;
  setUser: (user: any | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  /** The look saved on this device; stands in until the profile has loaded. */
  savedLook: SavedLook | null;
  /** The server accepted a new hero: show it now, whatever happens to the next read. */
  noteEquipped: (avatarId: string) => void;
  setActiveTab: (tab: MainTab) => void;
  setHomeSubTab: (tab: HomeSubTab) => void;
  /** Jump to the News feed from anywhere in the app. */
  openNews: () => void;
  setSelectedExerciseId: (id: string | null) => void;
  setIsGuest: (isGuest: boolean) => void;
  setLastMatchSummary: (summary: MatchSummaryStats | null) => void;
  setShopFilter: (filter: ShopFilter) => void;
  /** Jump to the Shop tab, optionally showing only the avatars the user owns. */
  openShop: (filter?: ShopFilter) => void;
  refreshProfile: () => Promise<UserProfile | null>;
  /** Guest only: whether the tutorial was finished on this device (null = not read yet). */
  guestTutorialDone: boolean | null;
  /** Shows the tutorial again from Profile > Settings, without changing the saved flag. */
  tutorialReplay: boolean;
  openTutorial: () => void;
  /** The tutorial was completed or skipped: profiles.is_tutorial = true (or the guest flag). */
  completeTutorial: () => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  profile: null,
  savedLook: null,
  activeTab: 'home',
  homeSubTab: 'lobby',
  selectedExerciseId: null,
  isGuest: false,
  lastMatchSummary: null,
  shopFilter: 'all',
  guestTutorialDone: null,
  tutorialReplay: false,
  openTutorial: () => set({ tutorialReplay: true }),
  completeTutorial: () => {
    const { isGuest, profile } = get();
    set({ tutorialReplay: false });
    if (isGuest) {
      set({ guestTutorialDone: true });
      AsyncStorage.setItem(GUEST_TUTORIAL_KEY, '1').catch(() => {});
      return;
    }
    if (!profile || profile.is_tutorial === true) return;
    set({ profile: { ...profile, is_tutorial: true } });
    markTutorialDone(profile.id);
  },
  setUser: (user) => {
    set({ user, isGuest: user?.isGuest || false });
    if (user && !user?.isGuest) {
      if (get().savedLook) {
        get().refreshProfile();
      } else {
        AsyncStorage.getItem(savedLookKey(user.id))
          .then((v) => {
            if (v) set({ savedLook: JSON.parse(v) });
          })
          .catch(() => {})
          .finally(() => get().refreshProfile());
      }
    } else if (user?.isGuest) {
      AsyncStorage.getItem(GUEST_TUTORIAL_KEY)
        .then((v) => set({ guestTutorialDone: v === '1' }))
        .catch(() => set({ guestTutorialDone: false }));
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
      cancelProfileRetry();
      latestProfileRead += 1;
      set({ profile: null, savedLook: null });
    }
  },
  setProfile: (incoming) => {
    const profile = incoming && resolveProfile(get().profile, incoming, get().savedLook);
    set({ profile });
    if (profile?.daily_challenges) {
      useDailyChallengeStore.getState().hydrateFromProfile(profile.daily_challenges);
    }
  },
  noteEquipped: (avatarId) => {
    const { user, profile, savedLook } = get();
    const look: SavedLook = { equipped_items: profile?.equipped_items ?? savedLook?.equipped_items, equipped_avatar_id: avatarId };
    set({ savedLook: look, profile: profile && { ...profile, equipped_avatar_id: avatarId } });
    if (user?.id) AsyncStorage.setItem(savedLookKey(user.id), JSON.stringify(look)).catch(() => {});
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setHomeSubTab: (homeSubTab) => set({ homeSubTab }),
  openNews: () => set({ activeTab: 'home', homeSubTab: 'news', selectedExerciseId: null }),
  setSelectedExerciseId: (selectedExerciseId) => set({ selectedExerciseId }),
  setIsGuest: (isGuest) => set({ isGuest }),
  setLastMatchSummary: (lastMatchSummary) => set({ lastMatchSummary }),
  setShopFilter: (shopFilter) => set({ shopFilter }),
  openShop: (shopFilter = 'all') => set({ activeTab: 'shop', shopFilter, selectedExerciseId: null }),
  refreshProfile: async () => {
    const { user, isGuest } = get();
    if (!user || isGuest) return null;
    const read = ++latestProfileRead;
    cancelProfileRetry();
    try {
      const fetched = await getOrCreateUserProfile(user);
      // Sign-in events each start a read: only the newest one may set the profile.
      if (read !== latestProfileRead) return get().profile;
      if (fetched.load_failed) {
        if (profileRetries < PROFILE_RETRY_MS.length) {
          profileRetryTimer = setTimeout(() => get().refreshProfile(), PROFILE_RETRY_MS[profileRetries++]);
        }
      } else {
        profileRetries = 0;
        if (fetched.equipped_avatar_id) {
          const look: SavedLook = { equipped_avatar_id: fetched.equipped_avatar_id, equipped_items: fetched.equipped_items };
          set({ savedLook: look });
          AsyncStorage.setItem(savedLookKey(user.id), JSON.stringify(look)).catch(() => {});
        }
      }
      const profileData = resolveProfile(get().profile, fetched, get().savedLook);
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
