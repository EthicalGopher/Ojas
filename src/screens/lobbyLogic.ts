// Pure lobby logic (design 3.6). No imports, so lobbyLogic.test.mjs can run it under Node.

export type LobbyMode = 'quick_duel' | 'ai_duel' | 'battle_ground' | 'solo';
export interface LastPlay {
  mode: LobbyMode;
  exerciseId: string;
}

export const LAST_PLAY_KEY = 'ojas.lobby.lastPlay';
export const DEFAULT_LAST_PLAY: LastPlay = { mode: 'ai_duel', exerciseId: '1' };
/** AI duel supports squats only (same rule as ExerciseDetailScreen and HumanVsAIModal). */
export const AI_DUEL_EXERCISES = ['1'];
export const LOBBY_MODES: LobbyMode[] = ['ai_duel', 'quick_duel', 'battle_ground', 'solo'];

export function modeSupportsExercise(mode: LobbyMode, exerciseId: string): boolean {
  return mode !== 'ai_duel' || AI_DUEL_EXERCISES.includes(exerciseId);
}

/** Invalid JSON, unknown mode or unknown exercise fall back per field; an unsupported pair resets the exercise to '1'. */
export function parseLastPlay(raw: string | null, exerciseIds: string[]): LastPlay {
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const mode: LobbyMode = parsed && LOBBY_MODES.includes(parsed.mode) ? parsed.mode : DEFAULT_LAST_PLAY.mode;
  let exerciseId: string =
    parsed && typeof parsed.exerciseId === 'string' && exerciseIds.includes(parsed.exerciseId) ? parsed.exerciseId : DEFAULT_LAST_PLAY.exerciseId;
  if (!modeSupportsExercise(mode, exerciseId)) exerciseId = '1';
  return { mode, exerciseId };
}

export function modeNeedsAuth(mode: LobbyMode): boolean {
  return mode === 'quick_duel' || mode === 'battle_ground';
}

export function modeLabel(mode: LobbyMode): string {
  switch (mode) {
    case 'quick_duel':
      return 'Quick duel';
    case 'ai_duel':
      return 'AI duel';
    case 'battle_ground':
      return 'Battle Ground';
    default:
      return 'Train solo';
  }
}

export function playLabel(mode: LobbyMode): string {
  switch (mode) {
    case 'quick_duel':
      return 'Find match';
    case 'ai_duel':
      return 'Fight AI';
    case 'battle_ground':
      return 'Enter arena';
    default:
      return 'Start training';
  }
}
