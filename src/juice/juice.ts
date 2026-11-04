// Haptics, sound effects and music (design page 49, section 3.4).
// expo-audio / expo-haptics are native: an older dev client without them crashes on import, so they are
// only required after requireOptionalNativeModule confirms they exist; otherwise every call is a no-op.
import { AppState, type AppStateStatus } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type * as AudioModuleTypes from 'expo-audio';
import type * as HapticsModuleTypes from 'expo-haptics';
import { primeReducedMotion } from '../components/game/motion';
import { JUICE_MAP, MUSIC_FILES } from './juiceMap';
import {
  MUSIC_COALESCE_MS,
  crossfadeSteps,
  musicVolumeFor,
  shouldPlay,
  type HapticKind,
  type JuiceEvent,
  type JuiceGroup,
  type MusicTrack,
} from './juiceLogic';
import { useJuiceSettings } from './juiceSettingsStore';

type Player = AudioModuleTypes.AudioPlayer;

const RELEASE_DELAY_MS = 1500;
const CROSSFADE_STEPS = 8;
const CROSSFADE_TICK_MS = 50;

let audio: typeof AudioModuleTypes | null | undefined;
let haptics: typeof HapticsModuleTypes | null | undefined;

function audioApi(): typeof AudioModuleTypes | null {
  if (audio !== undefined) return audio;
  try {
    audio = requireOptionalNativeModule('ExpoAudio') ? (require('expo-audio') as typeof AudioModuleTypes) : null;
  } catch {
    audio = null;
  }
  return audio;
}

function hapticsApi(): typeof HapticsModuleTypes | null {
  if (haptics !== undefined) return haptics;
  try {
    haptics = requireOptionalNativeModule('ExpoHaptics') ? (require('expo-haptics') as typeof HapticsModuleTypes) : null;
  } catch {
    haptics = null;
  }
  return haptics;
}

// ---------- SFX ----------

const players = new Map<JuiceEvent, Player>();
const lastPlayed: Partial<Record<JuiceEvent, number>> = {};
const groupCount: Record<JuiceGroup, number> = { ui: 0, match: 0 };
const releaseTimers: Partial<Record<JuiceGroup, ReturnType<typeof setTimeout>>> = {};

function eventsOf(group: JuiceGroup): JuiceEvent[] {
  return (Object.keys(JUICE_MAP) as JuiceEvent[]).filter((e) => JUICE_MAP[e].group === group);
}

function playerFor(event: JuiceEvent): Player | null {
  const existing = players.get(event);
  if (existing) return existing;
  const api = audioApi();
  if (!api) return null;
  try {
    const p = api.createAudioPlayer(JUICE_MAP[event].sfx);
    p.volume = JUICE_MAP[event].volume;
    players.set(event, p);
    return p;
  } catch {
    return null;
  }
}

function releaseGroupNow(group: JuiceGroup) {
  for (const e of eventsOf(group)) {
    const p = players.get(e);
    if (!p) continue;
    try {
      p.remove();
    } catch {}
    players.delete(e);
  }
}

async function replay(p: Player) {
  try {
    await p.seekTo(0);
    p.play();
  } catch {}
}

function haptic(kind: HapticKind) {
  if (!useJuiceSettings.getState().haptics) return;
  const h = hapticsApi();
  if (!h) return;
  const run = (): Promise<void> => {
    switch (kind) {
      case 'selection':
        return h.selectionAsync();
      case 'light':
        return h.impactAsync(h.ImpactFeedbackStyle.Light);
      case 'medium':
        return h.impactAsync(h.ImpactFeedbackStyle.Medium);
      case 'success':
        return h.notificationAsync(h.NotificationFeedbackType.Success);
      case 'warning':
        return h.notificationAsync(h.NotificationFeedbackType.Warning);
    }
  };
  run().catch(() => {});
}

function play(event: JuiceEvent | null | undefined) {
  if (!event) return;
  try {
    const now = Date.now();
    if (!shouldPlay(event, now, lastPlayed)) return;
    lastPlayed[event] = now;
    const spec = JUICE_MAP[event];
    if (spec.haptic) haptic(spec.haptic);
    if (!useJuiceSettings.getState().sfx) return;
    const p = playerFor(event);
    if (p) replay(p);
  } catch {}
}

function preload(group: JuiceGroup) {
  groupCount[group] += 1;
  const t = releaseTimers[group];
  if (t) {
    clearTimeout(t);
    delete releaseTimers[group];
  }
  for (const e of eventsOf(group)) playerFor(e);
}

function release(group: JuiceGroup) {
  groupCount[group] = Math.max(0, groupCount[group] - 1);
  if (groupCount[group] > 0 || releaseTimers[group]) return;
  // Delayed so a finishing win/rank_up sound is not cut and a quick remount reuses the players.
  releaseTimers[group] = setTimeout(() => {
    delete releaseTimers[group];
    if (groupCount[group] === 0) releaseGroupNow(group);
  }, RELEASE_DELAY_MS);
}

// ---------- Music (desired-state reconciler) ----------

let initialized = false;
let unlocked = false;
let foreground = AppState.currentState === 'active';
let ducked = false;
let desired: MusicTrack | null = null;
let current: { track: MusicTrack; player: Player } | null = null;
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function targetVolume(track: MusicTrack): number {
  return musicVolumeFor(track, useJuiceSettings.getState(), ducked);
}

function stopFade() {
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = null;
}

function dispose(p: Player) {
  try {
    p.pause();
    p.remove();
  } catch {}
}

function reconcile() {
  const s = useJuiceSettings.getState();
  const api = audioApi();
  const shouldPlayMusic = !!api && initialized && s.hydrated && s.music && foreground && unlocked && desired !== null;

  if (!shouldPlayMusic) {
    if (current) {
      try {
        current.player.pause();
      } catch {}
    }
    return;
  }
  const track = desired as MusicTrack;

  if (current && current.track === track) {
    try {
      current.player.volume = targetVolume(track);
      if (!current.player.playing) current.player.play();
    } catch {}
    return;
  }

  let next: Player;
  try {
    next = api!.createAudioPlayer(MUSIC_FILES[track]);
    next.loop = true;
    next.volume = 0;
    next.play();
  } catch {
    return;
  }
  const old = current;
  current = { track, player: next };
  stopFade();
  const fromVol = old ? old.player.volume : 0;
  const steps = crossfadeSteps(fromVol, targetVolume(track), CROSSFADE_STEPS);
  let i = 0;
  fadeTimer = setInterval(() => {
    try {
      if (old) old.player.volume = steps.out[i];
      next.volume = steps.in[i];
    } catch {}
    i += 1;
    if (i >= CROSSFADE_STEPS) {
      stopFade();
      if (old) dispose(old.player);
    }
  }, CROSSFADE_TICK_MS);
}

const music = {
  /** Records the desired track; applied after init, hydration, first touch and while in the foreground. */
  play(track: MusicTrack) {
    desired = track;
    if (coalesceTimer) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(() => {
      coalesceTimer = null;
      reconcile();
    }, MUSIC_COALESCE_MS);
  },
  stop() {
    desired = null;
    stopFade();
    if (current) dispose(current.player);
    current = null;
  },
  duck(on: boolean) {
    ducked = on;
    if (current) {
      try {
        current.player.volume = targetVolume(current.track);
      } catch {}
    }
  },
};

function unlock() {
  if (unlocked) return;
  unlocked = true;
  reconcile();
}

export async function initJuice(): Promise<void> {
  if (initialized) return;
  initialized = true;
  primeReducedMotion().catch(() => {});
  const api = audioApi();
  if (api) {
    try {
      // Spike 4.0: mixWithOthers never requests audio focus, so other apps are neither paused nor ducked.
      await api.setAudioModeAsync({
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch {}
  }
  AppState.addEventListener('change', (state: AppStateStatus) => {
    foreground = state === 'active';
    reconcile();
  });
  // Music off, volume changes and hydration apply immediately.
  useJuiceSettings.subscribe(() => reconcile());
  reconcile();
}

export const juice = { play, haptic, preload, release, unlock, music };
