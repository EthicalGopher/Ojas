// Pure logic for the Play asset packs (no imports, erasable TypeScript only, so Node can run it directly:
// see src/utils/assetPacksLogic.test.mjs). The native side is android/.../packs/PackStatusMapper.kt.

export type PackName = 'pose_heavy' | 'tree_pose';

export type PackStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'ready'
  | 'failed'
  | 'waiting_wifi'
  | 'needs_confirmation'
  | 'unavailable';

export type PackReason = '' | 'storage' | 'network' | 'play' | 'not_owned' | 'other';

export interface PackState {
  status: PackStatus;
  /** 0..1 */
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  errorCode: number;
  reason: PackReason;
}

export type ModelChoice = 'light' | 'medium' | 'high';

/** Display fallback only (Play reports the real totals once a download starts). */
export const PACK_SIZES: Record<PackName, number> = {
  pose_heavy: 27709200,
  tree_pose: 35431168,
};

export const READY_STATE: PackState = {
  status: 'ready',
  progress: 1,
  downloadedBytes: 0,
  totalBytes: 0,
  errorCode: 0,
  reason: '',
};

export const UNKNOWN_STATE: PackState = {
  status: 'unknown',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  errorCode: 0,
  reason: '',
};

const STATUSES: PackStatus[] = [
  'unknown',
  'pending',
  'downloading',
  'ready',
  'failed',
  'waiting_wifi',
  'needs_confirmation',
  'unavailable',
];
const REASONS: PackReason[] = ['', 'storage', 'network', 'play', 'not_owned', 'other'];

export function normalizeStatus(raw: string): PackStatus {
  return (STATUSES as string[]).includes(raw) ? (raw as PackStatus) : 'unknown';
}

export function normalizeReason(raw: string): PackReason {
  return (REASONS as string[]).includes(raw) ? (raw as PackReason) : 'other';
}

export function isReady(s: PackState | undefined): boolean {
  return !!s && s.status === 'ready';
}

/** "high" is only honoured once the heavy-model pack is ready; light and medium never wait for a pack. */
export function effectiveModel(
  selected: ModelChoice,
  heavy: PackState | undefined,
): { model: ModelChoice; downgraded: boolean } {
  if (selected === 'high' && !isReady(heavy)) return { model: 'medium', downgraded: true };
  return { model: selected, downgraded: false };
}

function clamp01(n: number): number {
  if (!(n > 0)) return 0; // also turns NaN into 0
  return n > 1 ? 1 : n;
}

/** "Ready", "42%", or the expected size ("35 MB", decimal megabytes) when nothing is known yet. */
export function formatProgress(s: PackState | undefined, fallbackTotal: number): string {
  if (s && s.status === 'ready') return 'Ready';
  if (s && (s.totalBytes > 0 || s.progress > 0)) return Math.round(clamp01(s.progress) * 100) + '%';
  return Math.round(fallbackTotal / 1e6) + ' MB';
}

/** What a screen should do with a pack: use it, wait, offer Retry, or give up (the app is not from Play). */
export function gate(s: PackState | undefined): 'ready' | 'wait' | 'retry' | 'unavailable' {
  if (!s) return 'wait';
  switch (s.status) {
    case 'ready':
      return 'ready';
    case 'failed':
      return 'retry';
    case 'unavailable':
      return 'unavailable';
    default:
      return 'wait';
  }
}

/**
 * True when a download that should be moving has not changed for [stallMs]. `history.at` is when the
 * caller last saw the status, downloadedBytes or progress change. A legitimate Wi-Fi wait never counts.
 */
export function isStalled(
  history: { status: PackStatus; downloadedBytes: number; progress: number; at: number },
  now: number,
  stallMs: number,
): boolean {
  const moving = history.status === 'unknown' || history.status === 'pending' || history.status === 'downloading';
  return moving && now - history.at >= stallMs;
}

/** Which pack an exercise needs (by id or name), or null when it needs none. */
export function packForExercise(exercise: string): PackName | null {
  const norm = (exercise || '').toLowerCase();
  if (norm.includes('tree') || norm.includes('vriksh') || norm === '9') return 'tree_pose';
  return null;
}

export function failureMessage(reason: PackReason): string {
  switch (reason) {
    case 'storage':
      return 'Not enough storage. Free some space, then retry.';
    case 'network':
      return 'No connection. Check your network, then retry.';
    case 'play':
      return "Google Play isn't available. Update Google Play services, then retry.";
    case 'not_owned':
      return 'Install Ojas from Google Play to download this.';
    default:
      return 'Download failed. Retry.';
  }
}
