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
