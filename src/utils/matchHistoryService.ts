// One row per finished match (public.match_history), shown in Profile > History.
import { supabase } from './supabase';

export type MatchHistoryMode = 'quickjoin' | 'ffa' | 'ai_battle';
export type MatchHistoryResult = 'win' | 'draw' | 'defeat';

export interface MatchHistoryEntry {
  id?: number;
  exercise_id: string;
  mode: MatchHistoryMode;
  opponent: string | null;
  result: MatchHistoryResult;
  self_score: number;
  opponent_score: number | null;
  points_delta: number;
  calories: number;
  duration_seconds: number;
  forfeit: boolean;
  created_at?: string;
}

const clampInt = (n: unknown, lo: number, hi: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0;
};

/** Saves a finished match. Guests (no account) are skipped. Never throws. */
export async function addMatchHistory(userId: string | undefined | null, entry: MatchHistoryEntry): Promise<void> {
  if (!userId || userId.startsWith('guest')) return;
  try {
    const { error } = await supabase.from('match_history').insert({
      user_id: userId,
      exercise_id: entry.exercise_id || '1',
      mode: entry.mode,
      opponent: entry.opponent ? entry.opponent.slice(0, 80) : null,
      result: entry.result,
      self_score: clampInt(entry.self_score, 0, 10000),
      opponent_score: entry.opponent_score === null ? null : clampInt(entry.opponent_score, 0, 10000),
      points_delta: clampInt(entry.points_delta, -10, 10),
      calories: clampInt(entry.calories, 0, 10000),
      duration_seconds: clampInt(entry.duration_seconds, 0, 3600),
      forfeit: !!entry.forfeit,
    });
    if (error) console.warn('match history not saved:', error.message);
  } catch (e) {
    console.warn('match history not saved:', e);
  }
}

/** The player's latest matches, newest first. */
export async function fetchMatchHistory(
  userId: string,
  limit = 50,
): Promise<{ entries: MatchHistoryEntry[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('match_history')
      .select('id, exercise_id, mode, opponent, result, self_score, opponent_score, points_delta, calories, duration_seconds, forfeit, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { entries: [], error: error.message };
    return { entries: (data ?? []) as MatchHistoryEntry[] };
  } catch (e: any) {
    return { entries: [], error: e?.message || 'Could not load match history' };
  }
}
