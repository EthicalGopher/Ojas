import * as Speech from 'expo-speech';
import { juice } from './juice';
import { duckTimeoutMs, isLatestUtterance } from './juiceLogic';

let latest = 0;
let safety: ReturnType<typeof setTimeout> | null = null;

function unduck(token: number) {
  if (!isLatestUtterance(token, latest)) return;
  if (safety) clearTimeout(safety);
  safety = null;
  juice.music.duck(false);
}

/**
 * Speech.stop() + Speech.speak() with the music ducked while it talks. Only the latest utterance can
 * un-duck, so a late onStopped from the interrupted phrase does not raise the music mid-sentence.
 */
export function speakDucked(text: string, options: Speech.SpeechOptions = {}): void {
  Speech.stop();
  const token = ++latest;
  if (safety) clearTimeout(safety);
  safety = setTimeout(() => unduck(token), duckTimeoutMs(text));
  Speech.speak(text, {
    ...options,
    onStart: () => {
      if (isLatestUtterance(token, latest)) juice.music.duck(true);
      options.onStart?.();
    },
    onDone: () => {
      unduck(token);
      options.onDone?.();
    },
    onStopped: () => {
      unduck(token);
      options.onStopped?.();
    },
    onError: (e) => {
      unduck(token);
      options.onError?.(e);
    },
  });
}

export function stopSpeech(): void {
  latest += 1;
  Speech.stop();
  if (safety) clearTimeout(safety);
  safety = null;
  juice.music.duck(false);
}
