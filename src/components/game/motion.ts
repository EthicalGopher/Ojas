import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Module-level so the first render of an overlay already knows the setting (primed by initJuice).
let reduced = false;
let primed = false;
const listeners = new Set<(v: boolean) => void>();

function set(v: boolean) {
  reduced = v;
  listeners.forEach((l) => l(v));
}

export async function primeReducedMotion(): Promise<void> {
  if (primed) return;
  primed = true;
  try {
    set(await AccessibilityInfo.isReduceMotionEnabled());
  } catch {}
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

/** True when the system asks for reduced motion; entrances then render at their final state and loops do not run. */
export function useReducedMotion(): boolean {
  const [value, setValue] = useState(reduced);
  useEffect(() => {
    listeners.add(setValue);
    setValue(reduced);
    if (!primed) primeReducedMotion();
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}
