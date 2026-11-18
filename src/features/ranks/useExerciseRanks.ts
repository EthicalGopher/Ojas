// Per-exercise ranks for the signed-in player: one rank (medal) per exercise, from match points.
import { useCallback, useEffect, useState } from 'react';
import { clampTier, RankTier } from '../../components/RankEmblem';
import { calculateLevel, fetchAllUserExerciseStats, LevelInfo, UserExerciseStats } from '../../utils/rankingService';

export interface ExerciseRank {
  exerciseId: string;
  points: number;
  tier: RankTier;
  level: LevelInfo;
  played: number;
  won: number;
}

export function exerciseRank(exerciseId: string, stats?: UserExerciseStats): ExerciseRank {
  const points = stats?.points ?? 0;
  const level = calculateLevel(points);
  return {
    exerciseId,
    points,
    tier: clampTier(level.level),
    level,
    played: stats?.matches_played ?? 0,
    won: stats?.matches_won ?? 0,
  };
}

/** Best rank across exercises: highest tier, then most points. Null when nothing is ranked yet. */
export function bestRank(ranks: ExerciseRank[]): ExerciseRank | null {
  let best: ExerciseRank | null = null;
  for (const r of ranks) {
    if (!best || r.tier > best.tier || (r.tier === best.tier && r.points > best.points)) best = r;
  }
  return best;
}

export function useExerciseRanks(userId: string | undefined, exerciseIds: string[]) {
  const [stats, setStats] = useState<Record<string, UserExerciseStats>>({});

  const reload = useCallback(() => {
    if (!userId) {
      setStats({});
      return;
    }
    fetchAllUserExerciseStats(userId)
      .then(setStats)
      .catch(() => {});
  }, [userId]);

  useEffect(reload, [reload]);

  const ranks = exerciseIds.map((id) => exerciseRank(id, stats[id]));
  const rankOf = (id: string) => ranks.find((r) => r.exerciseId === id) ?? exerciseRank(id);
  return { ranks, rankOf, best: bestRank(ranks), reload };
}
