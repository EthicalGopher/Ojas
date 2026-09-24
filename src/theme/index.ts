// Shared design tokens for the Ojas UI.

export const colors = {
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
} as const;

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
 * Light cards use dark text; orange/navy cards use white text.
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
