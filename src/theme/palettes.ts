// Arena colour tokens (design page 49, section 3.1). Import-free so Node tests can read it
// (see src/theme/theme.test.mjs). src/theme/index.ts re-exports everything here.

export const darkColors = {
  bg: '#0E1726',
  bgTop: '#13223A',
  surface: '#16233A',
  surfaceHi: '#1F2E48',
  surfaceSunken: '#0A111D',
  raised: '#1B2A44',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',
  edge: 'rgba(255, 255, 255, 0.12)',
  highlight: 'rgba(255, 255, 255, 0.08)',
  shadowTint: 'rgba(0, 0, 0, 0.45)',
  hudEdge: 'rgba(255, 255, 255, 0.18)',
  scrim: 'rgba(6, 12, 22, 0.72)',

  text: '#F3F7FB',
  textMuted: '#9AA9BC',
  textDim: '#8494A8',
  textOnLight: '#14233A',

  accent: '#E25822',
  accentFrom: '#FF5A3C',
  accentTo: '#FF9A3C',
  accentLip: '#C2410C',
  edgeAccent: '#FF8A5B',
  onAccent: '#FFFFFF',
  onGradient: '#14233A',

  you: '#FF6A2B',
  rival: '#3B8DFF',
  win: '#FFB627',
  loss: '#FF4D5E',
  lossLip: '#A61E2D',
  draw: '#9AA9BC',
  youInk: '#FF8A5B',
  rivalInk: '#7DB5FF',
  winInk: '#FFC857',
  lossInk: '#FF8A95',

  // Legacy keys, still used by screens that are not migrated yet.
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

export const lightColors: Palette = {
  bg: '#E9F6F4',
  bgTop: '#DDF1FF',
  surface: '#FFFFFF',
  surfaceHi: '#E3ECEF',
  surfaceSunken: '#D7E6E8',
  raised: '#FFFFFF',
  border: 'rgba(20, 35, 58, 0.08)',
  borderStrong: 'rgba(20, 35, 58, 0.16)',
  edge: 'rgba(20, 35, 58, 0.12)',
  highlight: 'rgba(255, 255, 255, 0.90)',
  shadowTint: 'rgba(20, 35, 58, 0.18)',
  hudEdge: 'rgba(20, 35, 58, 0.22)',
  scrim: 'rgba(20, 35, 58, 0.45)',

  text: '#14233A',
  textMuted: '#5A6B80',
  textDim: '#56667A',
  textOnLight: '#14233A',

  accent: '#E25822',
  accentFrom: '#FF5A3C',
  accentTo: '#FF9A3C',
  accentLip: '#C2410C',
  edgeAccent: '#B8420F',
  onAccent: '#FFFFFF',
  onGradient: '#14233A',

  you: '#F7672A', // 3% darker than the dark-mode value so bars/icons reach 3:1 on white (theme-test)
  rival: '#1F74E0',
  win: '#C98A00',
  loss: '#D93448',
  lossLip: '#A61E2D',
  draw: '#5A6B80',
  youInk: '#C2410C',
  rivalInk: '#1F66C9',
  winInk: '#8A5A00',
  lossInk: '#B3202F',

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
