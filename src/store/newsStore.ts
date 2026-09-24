import { create } from 'zustand';
import {
  NewsItem,
  fetchIsAdmin,
  fetchNews,
  fetchNewsLastSeen,
  markNewsSeen,
  subscribeToNews,
} from '../utils/newsService';

interface NewsState {
  items: NewsItem[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  lastSeenAt: string | null;
  userId: string | null;
  init: (userId: string | null) => () => void;
  refresh: () => Promise<void>;
  markAllSeen: () => void;
}

export const selectUnreadCount = (s: NewsState): number => {
  const seen = s.lastSeenAt ? Date.parse(s.lastSeenAt) : 0;
  return s.items.filter((n) => Date.parse(n.created_at) > seen).length;
};

export const useNewsStore = create<NewsState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  isAdmin: false,
  lastSeenAt: null,
  userId: null,

  init: (userId) => {
    const isRealUser = !!userId && userId !== 'guest_athlete_local';
    set({ userId: isRealUser ? userId : null, isAdmin: false, lastSeenAt: null });

    if (isRealUser) {
      fetchIsAdmin(userId!).then((isAdmin) => set({ isAdmin }));
      fetchNewsLastSeen(userId!).then((lastSeenAt) => set({ lastSeenAt }));
    }

    get().refresh();
    return subscribeToNews(() => get().refresh());
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const items = await fetchNews();
      set({ items, loading: false });
    } catch (e: any) {
      console.warn('[newsStore] refresh failed:', e?.message);
      set({ loading: false, error: e?.message || 'Could not load news' });
    }
  },

  markAllSeen: () => {
    const newest = get().items.reduce<string | null>(
      (max, n) => (!max || n.created_at > max ? n.created_at : max),
      null
    );
    if (!newest || newest === get().lastSeenAt) return;
    set({ lastSeenAt: newest });
    const { userId } = get();
    if (userId) markNewsSeen(userId, newest);
  },
}));
