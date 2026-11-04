// Pure juice logic (design 3.4). No value imports, so juiceLogic.test.mjs can run it under Node.

export type JuiceEvent =
  | 'tap' | 'toggle' | 'ready' | 'fight' | 'rep' | 'hold_mark' | 'rival_rep' | 'combo'
  | 'lead_take' | 'lead_lost' | 'tick' | 'win' | 'lose' | 'draw' | 'level_up' | 'rank_up' | 'quest_done';
export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning';
export type MusicTrack = 'menu' | 'match';
export type JuiceGroup = 'ui' | 'match';

export interface JuiceSettings {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  musicVolume: number;
}

export const DEFAULT_JUICE_SETTINGS: JuiceSettings = { music: true, sfx: true, haptics: true, musicVolume: 0.6 };
export const VOLUME_STEPS = [0.2, 0.4, 0.6, 0.8, 1] as const;
export const THROTTLE_MS = 60;
export const MUSIC_COALESCE_MS = 300;
export const MATCH_MUSIC_FACTOR = 0.35;
export const DUCK_FACTOR = 0.25;

/** True if `event` may play now; the same event within THROTTLE_MS is dropped. Does not mutate. */
export function shouldPlay(event: JuiceEvent, nowMs: number, lastPlayed: Partial<Record<JuiceEvent, number>>): boolean {
  const last = lastPlayed[event];
  return last === undefined || nowMs - last >= THROTTLE_MS;
}

export function musicVolumeFor(track: MusicTrack, s: JuiceSettings, ducked: boolean): number {
  if (!s.music) return 0;
  const v = Math.min(1, Math.max(0, s.musicVolume));
  const base = track === 'match' ? v * MATCH_MUSIC_FACTOR : v;
  return ducked ? base * DUCK_FACTOR : base;
}

function nearestStep(v: number): number {
  let best: number = VOLUME_STEPS[0];
  for (const step of VOLUME_STEPS) if (Math.abs(step - v) < Math.abs(best - v)) best = step;
  return best;
}

/** Per-field fallback to the defaults; musicVolume is snapped to the nearest VOLUME_STEPS entry. */
export function sanitizeSettings(raw: unknown): JuiceSettings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bool = (k: 'music' | 'sfx' | 'haptics') => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_JUICE_SETTINGS[k]);
  const vol = typeof r.musicVolume === 'number' && Number.isFinite(r.musicVolume) ? nearestStep(r.musicVolume) : DEFAULT_JUICE_SETTINGS.musicVolume;
  return { music: bool('music'), sfx: bool('sfx'), haptics: bool('haptics'), musicVolume: vol };
}

/** Linear crossfade: `out` ramps from -> 0, `in` ramps 0 -> to, both of length `steps`. */
export function crossfadeSteps(from: number, to: number, steps: number): { out: number[]; in: number[] } {
  const out: number[] = [];
  const inn: number[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push(from * (1 - t));
    inn.push(to * t);
  }
  return { out, in: inn };
}

export function isLatestUtterance(token: number, latest: number): boolean {
  return token === latest;
}

/** Safety timeout for un-ducking music if speech never reports its end. */
export function duckTimeoutMs(text: string): number {
  return Math.max(8000, 90 * text.length + 2000);
}
