import type { UserProfile } from './profileService';

// XP is derived from activity the app already stores on the profile
// (daily_calories + daily_challenges), so it needs no extra database columns.
export const XP_PER_REP = 1;
export const XP_PER_MATCH = 25;
export const XP_PER_KCAL = 2;
export const XP_PER_CHALLENGE = 50;

export interface LevelProgress {
  level: number;
  title: string;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
}

export interface StreakInfo {
  current: number;
  best: number;
  activeToday: boolean;
  /** true when yesterday was active but today isn't yet: the streak ends at midnight */
  atRisk: boolean;
}

const LEVEL_TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Rookie' },
  { minLevel: 3, title: 'Challenger' },
  { minLevel: 6, title: 'Warrior' },
  { minLevel: 10, title: 'Master' },
  { minLevel: 15, title: 'Champion' },
  { minLevel: 20, title: 'Legend' },
];

export const toDateKey = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/** Cumulative XP required to reach `level` (level 1 = 0 XP, 2 = 100, 3 = 300, 4 = 600 ...). */
export const xpToReachLevel = (level: number): number => (100 * (level - 1) * level) / 2;

export function levelFromXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xp >= xpToReachLevel(level + 1)) level++;

  const floor = xpToReachLevel(level);
  const span = xpToReachLevel(level + 1) - floor;
  const title = [...LEVEL_TITLES].reverse().find((t) => level >= t.minLevel)?.title ?? 'Rookie';

  return {
    level,
    title,
    totalXp: xp,
    xpIntoLevel: xp - floor,
    xpForNextLevel: span,
    progress: span > 0 ? (xp - floor) / span : 0,
  };
}

const completedChallengesOn = (profile: UserProfile | null, dateKey: string): number =>
  profile?.daily_challenges?.[dateKey]?.completedIds?.length ?? 0;

export function isActiveDay(profile: UserProfile | null, dateKey: string): boolean {
  const log = profile?.daily_calories?.[dateKey];
  return (
    (log?.calories ?? 0) > 0 ||
    (log?.reps ?? 0) > 0 ||
    (log?.matches ?? 0) > 0 ||
    completedChallengesOn(profile, dateKey) > 0
  );
}

/**
 * @param liveCaloriesToday calories tracked in this session that may not be synced to the profile yet
 */
export function computeTotalXp(profile: UserProfile | null, liveCaloriesToday: number = 0): number {
  if (!profile) return 0;
  let xp = 0;

  const logs = profile.daily_calories ?? {};
  for (const log of Object.values(logs)) {
    xp += (log?.reps ?? 0) * XP_PER_REP;
    xp += (log?.matches ?? 0) * XP_PER_MATCH;
    xp += Math.round((log?.calories ?? 0) * XP_PER_KCAL);
  }

  const challenges = profile.daily_challenges ?? {};
  for (const day of Object.values(challenges)) {
    xp += (day?.completedIds?.length ?? 0) * XP_PER_CHALLENGE;
  }

  const todaySynced = logs[toDateKey(new Date())]?.calories ?? 0;
  xp += Math.round(Math.max(0, liveCaloriesToday - todaySynced) * XP_PER_KCAL);

  return xp;
}

export function computeStreak(profile: UserProfile | null, liveActiveToday: boolean = false): StreakInfo {
  const activeDays = new Set<string>();
  for (const key of Object.keys(profile?.daily_calories ?? {})) {
    if (isActiveDay(profile, key)) activeDays.add(key);
  }
  for (const key of Object.keys(profile?.daily_challenges ?? {})) {
    if (isActiveDay(profile, key)) activeDays.add(key);
  }

  const today = new Date();
  const todayKey = toDateKey(today);
  if (liveActiveToday) activeDays.add(todayKey);

  const activeToday = activeDays.has(todayKey);

  const cursor = new Date(today);
  if (!activeToday) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (activeDays.has(toDateKey(cursor))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const key of [...activeDays].sort()) {
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const isNext = prev && Math.round((date.getTime() - prev.getTime()) / 86400000) === 1;
    run = isNext ? run + 1 : 1;
    best = Math.max(best, run);
    prev = date;
  }

  return {
    current,
    best: Math.max(best, current),
    activeToday,
    atRisk: !activeToday && current > 0,
  };
}
