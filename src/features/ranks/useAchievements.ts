// Achievement medals shown on the Ranked page. Each tracks real progress toward its goal.
import { useEffect, useState } from 'react';
import type { MedalMark, MedalMetal } from '../../components/AchievementBadge';
import { useGameStats } from '../../hooks/useGameStats';
import { useUserStore } from '../../store/userStore';
import { fetchFriends } from '../../utils/friendService';

export interface Achievement {
  key: string;
  title: string;
  metal: MedalMetal;
  mark: MedalMark;
  have: number;
  need: number;
  unit: string;
}

export function useAchievements(userId: string | undefined, reloadKey?: unknown): Achievement[] {
  const { level, streak } = useGameStats();
  const totalCalories = Math.round(useUserStore((s) => s.profile?.total_calories) || 0);
  const [friendCount, setFriendCount] = useState(0);

  useEffect(() => {
    if (!userId) return setFriendCount(0);
    fetchFriends(userId)
      .then((f) => setFriendCount(f.length))
      .catch(() => {});
  }, [userId, reloadKey]);

  return [
    { key: 'first', title: 'First Rep', metal: 'bronze', mark: { kind: 'text', value: '1' }, have: level.totalXp > 0 ? 1 : 0, need: 1, unit: 'workout' },
    { key: 'streak3', title: 'On Fire', metal: 'bronze', mark: { kind: 'flame', value: '3' }, have: streak.best, need: 3, unit: 'days' },
    { key: 'streak7', title: 'Unstoppable', metal: 'gold', mark: { kind: 'flame', value: '7' }, have: streak.best, need: 7, unit: 'days' },
    { key: 'social', title: 'Squad Up', metal: 'silver', mark: { kind: 'duo' }, have: friendCount, need: 1, unit: 'friend' },
    { key: 'level5', title: 'Rising Star', metal: 'silver', mark: { kind: 'star' }, have: level.level, need: 5, unit: 'level' },
    { key: 'kcal', title: 'Furnace', metal: 'gold', mark: { kind: 'text', value: '1K' }, have: totalCalories, need: 1000, unit: 'kcal' },
  ];
}
