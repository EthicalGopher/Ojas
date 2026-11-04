// Shared design tokens for the Ojas UI.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { darkColors, palettes, type Palette } from './palettes';

export { darkColors, lightColors, palettes } from './palettes';
export type { Palette } from './palettes';
/** Alias that avoids clashing with the lucide `Palette` icon. */
export type ThemeColors = Palette;

/** Dark palette, for screens that stay dark in every mode. */
export const colors: Palette = darkColors;

// ---------- Appearance preference ----------

export type ThemeMode = 'system' | 'light' | 'dark';
const THEME_KEY = 'ojas.themeMode';

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: 'system',
  setMode: (mode) => {
    set({ mode });
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  },
}));

AsyncStorage.getItem(THEME_KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark' || saved === 'system') useThemeStore.setState({ mode: saved });
  })
  .catch(() => {});

/** 'light' | 'dark' after resolving the System option against the device setting. */
export function useResolvedScheme(): 'light' | 'dark' {
  const mode = useThemeStore((s) => s.mode);
  const system = useColorScheme();
  if (mode === 'system') return system === 'light' ? 'light' : 'dark';
  return mode;
}

/** Current palette; components re-render when the appearance changes. */
export function useColors(): Palette {
  return palettes[useResolvedScheme()];
}

/**
 * Themed StyleSheet factory: `const useStyles = makeStyles((c) => StyleSheet.create({...}))`,
 * then `const styles = useStyles()` inside the component.
 */
export function makeStyles<T>(factory: (c: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles() {
    const c = useColors();
    return useMemo(() => {
      if (!cache.has(c)) cache.set(c, factory(c));
      return cache.get(c)!;
    }, [c]);
  };
}

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 26,
  panel: 20,
  pill: 999,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Soft panel shadow (RN boxShadow, New Architecture). */
export const softShadow = (c: Palette) => ({ boxShadow: `0 6px 16px ${c.shadowTint}` });

export { typeStyle, typeMfm } from './typography';
export type { TextVariant } from './typography';

export const shadow = (elevation: number = 6) => ({
  shadowColor: '#000',
  shadowOffset: { width: 0, height: Math.round(elevation * 0.75) },
  shadowOpacity: 0.25,
  shadowRadius: elevation * 1.5,
  elevation,
});

/**
 * Colored card styles, matching the workout cards on the Train (Exercises) screen.
 * Light cards use dark text; orange/navy cards use white text. Same in both modes.
 */
export interface CardTheme {
  bg: string;
  text: string;
  sub: string;
  chip: string;
  track: string;
  onDark: boolean;
}

const LIGHT_TEXT = { text: '#11141A', sub: '#374151', chip: 'rgba(17, 20, 26, 0.08)', track: 'rgba(17, 20, 26, 0.12)', onDark: false };
const DARK_TEXT = { text: '#FFFFFF', sub: 'rgba(255, 255, 255, 0.82)', chip: 'rgba(255, 255, 255, 0.18)', track: 'rgba(255, 255, 255, 0.2)', onDark: true };

export const cardThemes = {
  lavender: { bg: '#C8B6FF', ...LIGHT_TEXT },
  pink: { bg: '#FFD6E0', ...LIGHT_TEXT },
  mint: { bg: '#A7F3D0', ...LIGHT_TEXT, sub: '#065F46' },
  sand: { bg: '#E8D5C4', ...LIGHT_TEXT },
  orange: { bg: '#E25822', ...DARK_TEXT },
  navy: { bg: '#354394', ...DARK_TEXT },
} satisfies Record<string, CardTheme>;

/** Rotating order used for lists of cards (same rhythm as the Exercises screen). */
export const cardCycle: CardTheme[] = [cardThemes.lavender, cardThemes.pink, cardThemes.orange, cardThemes.navy, cardThemes.mint];

/** Exercise cards alternate between just these two colors. */
export const exerciseCardThemes: CardTheme[] = [cardThemes.lavender, cardThemes.pink];
