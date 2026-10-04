import { supabase } from './supabase';
import { AvatarConfig } from '../components/Avatar';

export interface LevelInfo {
  level: number;
  title: string;
  tier: string;
  color: string;
  minPoints: number;
  nextLevelPoints: number;
  progressPercent: number;
  pointsToNext: number;
}

export interface ExerciseLeaderboardEntry {
  id: string;
  user_id: string;
  exercise_id: string;
  username: string;
  full_name?: string;
  avatar_config?: AvatarConfig;
  avatar_url?: string | null;
  points: number;
  matches_played: number;
  matches_won: number;
  matches_drawn: number;
  matches_lost: number;
  reps_completed: number;
  rank?: number;
}

export interface UserExerciseStats {
  user_id: string;
  exercise_id: string;
  points: number;
  matches_played: number;
  matches_won: number;
  matches_drawn: number;
  matches_lost: number;
  reps_completed: number;
}

export const LEVEL_TIERS: {
  level: number;
  title: string;
  tier: string;
  color: string;
  minPoints: number;
  maxPoints: number;
}[] = [
  { level: 1, title: 'Rookie', tier: 'Bronze', color: '#CD7F32', minPoints: 0, maxPoints: 99 },
  { level: 2, title: 'Challenger', tier: 'Silver', color: '#C0C0C0', minPoints: 100, maxPoints: 249 },
  { level: 3, title: 'Warrior', tier: 'Gold', color: '#F59E0B', minPoints: 250, maxPoints: 499 },
  { level: 4, title: 'Master', tier: 'Platinum', color: '#38BDF8', minPoints: 500, maxPoints: 999 },
  { level: 5, title: 'Champion', tier: 'Diamond', color: '#A855F7', minPoints: 1000, maxPoints: 1999 },
  { level: 6, title: 'Grandmaster', tier: 'Immortal', color: '#EF4444', minPoints: 2000, maxPoints: 999999 },
];

/**
 * Calculates current level, title and progress based on points.
 * Rules: Win = +10, Draw = +5, Defeat = -10.
 */
export function calculateLevel(points: number = 0, exerciseName: string = 'Athlete'): LevelInfo {
  const currentPts = Math.max(0, points);
  
  for (let i = 0; i < LEVEL_TIERS.length; i++) {
    const tier = LEVEL_TIERS[i];
    const isLast = i === LEVEL_TIERS.length - 1;

    if (currentPts <= tier.maxPoints || isLast) {
      const range = tier.maxPoints - tier.minPoints + 1;
      const progress = currentPts - tier.minPoints;
      const progressPercent = isLast ? 100 : Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
      const nextLevelPoints = isLast ? tier.maxPoints : tier.maxPoints + 1;
      const pointsToNext = Math.max(0, nextLevelPoints - currentPts);

      return {
        level: tier.level,
        title: tier.title,
        tier: tier.tier,
        color: tier.color,
        minPoints: tier.minPoints,
        nextLevelPoints,
        progressPercent,
        pointsToNext,
      };
    }
  }

  return {
    level: 1,
    title: 'Rookie',
   
    tier: 'Bronze',
    color: '#CD7F32',
    minPoints: 0,
    nextLevelPoints: 100,
    progressPercent: 0,
    pointsToNext: 100,
  };
}

/**
 * Fetches per-exercise leaderboard data from Supabase.
 * Each exercise has its own independent standings, points, and ranks.
 */
export async function fetchExerciseLeaderboard(
  exerciseId: string,
  limit = 50
): Promise<ExerciseLeaderboardEntry[]> {
  try {
    const { data: statsData, error: statsError } = await supabase
      .from('user_exercise_stats')
      .select('user_id, exercise_id, points, matches_played, matches_won, matches_drawn, matches_lost, reps_completed')
      .eq('exercise_id', exerciseId)
      .order('points', { ascending: false })
      .limit(limit);

    if (statsError) {
      console.warn('Error fetching exercise stats:', statsError.message);
      return [];
    }

    if (!statsData || statsData.length === 0) {
      return [];
    }

    const userIds = statsData.map((s) => s.user_id);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_config, avatar_url')
      .in('id', userIds);

    const profilesMap = new Map<string, any>();
    (profilesData || []).forEach((p) => profilesMap.set(p.id, p));

    return statsData.map((stat, index) => {
      const profile = profilesMap.get(stat.user_id);
      return {
        id: stat.user_id,
        user_id: stat.user_id,
        exercise_id: stat.exercise_id,
        username: profile?.username || `athlete_${stat.user_id.slice(0, 5)}`,
        full_name: profile?.full_name,
        avatar_config: profile?.avatar_config,
        avatar_url: profile?.avatar_url || null,
        points: stat.points ?? 0,
        matches_played: stat.matches_played ?? 0,
        matches_won: stat.matches_won ?? 0,
        matches_drawn: stat.matches_drawn ?? 0,
        matches_lost: stat.matches_lost ?? 0,
        reps_completed: stat.reps_completed ?? 0,
        rank: index + 1,
      };
    });
  } catch (err: any) {
    console.warn('Failed to fetch exercise leaderboard:', err?.message || err);
    return [];
  }
}

/**
 * Fetches single user's stats for a specific exercise.
 */
export async function fetchUserExerciseStats(
  userId: string,
  exerciseId: string
): Promise<UserExerciseStats> {
  const defaultStats: UserExerciseStats = {
    user_id: userId,
    exercise_id: exerciseId,
    points: 0,
    matches_played: 0,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    reps_completed: 0,
  };

  if (!userId || !exerciseId) return defaultStats;

  try {
    const { data, error } = await supabase
      .from('user_exercise_stats')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .maybeSingle();

    if (!error && data) {
      return {
        user_id: data.user_id,
        exercise_id: data.exercise_id,
        points: data.points ?? 0,
        matches_played: data.matches_played ?? 0,
        matches_won: data.matches_won ?? 0,
        matches_drawn: data.matches_drawn ?? 0,
        matches_lost: data.matches_lost ?? 0,
        reps_completed: data.reps_completed ?? 0,
      };
    }
    return defaultStats;
  } catch (err) {
    return defaultStats;
  }
}

/**
 * Records match outcome for a specific exercise game.
 * Rules: Win: +10 pts, Draw: +5 pts, Defeat: -10 pts.
 */
export async function recordExerciseMatchResult(
  userId: string,
  exerciseId: string = '1',
  result: 'win' | 'draw' | 'defeat',
  reps: number = 0
): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!userId) return { success: false, error: 'No user ID provided' };

  try {
    const { data, error } = await supabase.rpc('record_exercise_match_result', {
      p_user_id: userId,
      p_exercise_id: exerciseId,
      p_result: result,
      p_reps: reps,
    });

    if (error) {
      console.warn('RPC record_exercise_match_result error, using fallback:', error.message);
      
      // Fallback manual upsert
      const currentStats = await fetchUserExerciseStats(userId, exerciseId);
      let delta = result === 'win' ? 10 : result === 'draw' ? 5 : -10;
      const newPoints = Math.max(0, currentStats.points + delta);

      const updatePayload = {
        user_id: userId,
        exercise_id: exerciseId,
        points: newPoints,
        matches_played: currentStats.matches_played + 1,
        matches_won: currentStats.matches_won + (result === 'win' ? 1 : 0),
        matches_drawn: currentStats.matches_drawn + (result === 'draw' ? 1 : 0),
        matches_lost: currentStats.matches_lost + (result === 'defeat' ? 1 : 0),
        reps_completed: currentStats.reps_completed + Math.max(0, reps),
        updated_at: new Date().toISOString(),
      };

      const { data: upserted, error: upsertError } = await supabase
        .from('user_exercise_stats')
        .upsert(updatePayload, { onConflict: 'user_id,exercise_id' })
        .select()
        .single();

      if (upsertError) return { success: false, error: upsertError.message };
      return { success: true, data: upserted };
    }

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error recording exercise match result' };
  }
}
