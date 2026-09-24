import { supabase } from './supabase';

export type NewsCategory = 'update' | 'event' | 'challenge' | 'tip' | 'alert';

export interface NewsAuthor {
  username: string | null;
  avatar_url: string | null;
  avatar_config: any;
}

export interface NewsItem {
  id: string;
  title: string;
  body: string;
  category: NewsCategory;
  image_url: string | null;
  is_pinned: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  author?: NewsAuthor | null;
}

export interface NewsDraft {
  title: string;
  body: string;
  category: NewsCategory;
  is_pinned: boolean;
  image_url?: string | null;
}

export const NEWS_CATEGORIES: { key: NewsCategory; label: string; color: string }[] = [
  { key: 'update', label: 'Update', color: '#38BDF8' },
  { key: 'event', label: 'Event', color: '#F59E0B' },
  { key: 'challenge', label: 'Challenge', color: '#E25822' },
  { key: 'tip', label: 'Pro Tip', color: '#C8B6FF' },
  { key: 'alert', label: 'Alert', color: '#EF4444' },
];

export const getNewsCategoryMeta = (key: NewsCategory) =>
  NEWS_CATEGORIES.find((c) => c.key === key) ?? NEWS_CATEGORIES[0];

const NEWS_SELECT =
  'id, title, body, category, image_url, is_pinned, author_id, created_at, updated_at, author:profiles!news_author_id_fkey(username, avatar_url, avatar_config)';

export async function fetchNews(limit: number = 50): Promise<NewsItem[]> {
  const { data, error } = await supabase
    .from('news')
    .select(NEWS_SELECT)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as NewsItem[];
}

/**
 * Reads the admin flag straight from public.profiles. auth user_metadata is
 * editable by the user, so it is never trusted for this.
 */
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return data?.is_admin === true;
}

export async function createNews(authorId: string, draft: NewsDraft): Promise<NewsItem> {
  const { data, error } = await supabase
    .from('news')
    .insert({
      title: draft.title.trim(),
      body: draft.body.trim(),
      category: draft.category,
      is_pinned: draft.is_pinned,
      image_url: draft.image_url?.trim() || null,
      author_id: authorId,
    })
    .select(NEWS_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as NewsItem;
}

export async function updateNews(id: string, changes: Partial<NewsDraft>): Promise<void> {
  const { error } = await supabase.from('news').update(changes).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteNews(id: string): Promise<void> {
  const { error } = await supabase.from('news').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchNewsLastSeen(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('news_last_seen_at')
    .eq('id', userId)
    .maybeSingle();
  return data?.news_last_seen_at ?? null;
}

export async function markNewsSeen(userId: string, seenAt: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ news_last_seen_at: seenAt })
    .eq('id', userId);
  if (error) console.warn('[newsService] markNewsSeen failed:', error.message);
}

/** Calls `onChange` whenever news is published, edited or deleted. Returns an unsubscribe fn. */
export function subscribeToNews(onChange: () => void): () => void {
  const channel = supabase
    .channel('public:news')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'news' }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
