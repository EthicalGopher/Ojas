// Shared design tokens for the Ojas UI.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const darkColors = {
  bg: '#1A1C20',
  surface: '#161B22',
  surfaceHi: '#262A32',
  surfaceSunken: '#0D111A',
  border: 'rgba(255, 255, 255, 0.07)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  text: '#FFFFFF',
  textMuted: '#8E95A0',
  textDim: '#64748B',
  textOnLight: '#11141A',

  accent: '#E25822',
  onAccent: '#FFFFFF',
  flame: '#E25822',
  lavender: '#C8B6FF',
  pink: '#FFD6E0',
  navy: '#354394',
  gold: '#F59E0B',
  sky: '#38BDF8',
  success: '#10B981',
  danger: '#EF4444',
};

export type Palette = typeof darkColors;
/** Alias that avoids clashing with the lucide `Palette` icon. */
export type ThemeColors = Palette;

const lightColors: Palette = {
  bg: '#F4F5F9',
  surface: '#FFFFFF',
  surfaceHi: '#ECEEF3',
  surfaceSunken: '#E6E8EF',
  border: 'rgba(17, 20, 26, 0.08)',
  borderStrong: 'rgba(17, 20, 26, 0.16)',

  text: '#11141A',
  textMuted: '#5B6474',
  textDim: '#8A93A5',
  textOnLight: '#11141A',

  accent: '#E25822',
  onAccent: '#FFFFFF',
  flame: '#E25822',
  lavender: '#C8B6FF',
  pink: '#FFD6E0',
  navy: '#354394',
  gold: '#D97706',
  sky: '#0284C7',
  success: '#059669',
  danger: '#DC2626',
};

export const palettes = { dark: darkColors, light: lightColors };

/** Dark palette, for screens that stay dark in every mode (camera, matches). */
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
  pill: 999,
} as const;

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
