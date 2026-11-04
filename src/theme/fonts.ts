// Bundled Nunito fonts (SIL OFL 1.1, see src/legal/licenses.ts). Design 3.2.
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black_Italic } from '@expo-google-fonts/nunito';
import { FONT_FAMILIES } from './typeSpec';

export const FONT = FONT_FAMILIES;
export type FontKey = 'blackItalic' | 'extraBold' | 'bold' | 'semi';
export const FONT_TIMEOUT_MS = 3000;

let state: 'pending' | 'loaded' | 'failed' = 'pending';

/** False until the fonts loaded; stays false after a load failure or the 3 s timeout (system font fallback). */
export function fontsAvailable(): boolean {
  return state === 'loaded';
}

/** True once the fonts loaded, failed or timed out. */
export function useGameFonts(): boolean {
  const [loaded, error] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black_Italic });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (state === 'pending') {
    if (loaded) state = 'loaded';
    else if (error || timedOut) state = 'failed';
  }
  return state !== 'pending';
}
