// WCAG contrast helpers and the token pairs the theme must satisfy (design 3.1).
// No value imports, so src/theme/theme.test.mjs can run it under Node.
import type { Palette } from './palettes';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ToneKey = 'accent' | 'you' | 'rival' | 'win' | 'loss' | 'draw';

const WHITE = '#FFFFFF';

/** Text colour for text on a tone fill: navy or white, whichever contrasts more (accent uses onGradient). */
export function toneText(p: Palette, tone: ToneKey): string {
  if (tone === 'accent') return p.onGradient;
  const fill = p[tone];
  return contrastRatio(p.textOnLight, fill) >= contrastRatio(WHITE, fill) ? p.textOnLight : WHITE;
}

export interface ContrastPair {
  name: string;
  fg: (p: Palette) => string;
  bg: (p: Palette) => string;
  min: 4.5 | 3;
  /** Only check this palette (default: both). */
  only?: 'light' | 'dark';
}

const TONES: ToneKey[] = ['you', 'rival', 'win', 'loss', 'draw'];
const INKS = ['youInk', 'rivalInk', 'winInk', 'lossInk'] as const;
const TEXTS = ['text', 'textMuted', 'textDim'] as const;
const GROUNDS = ['bg', 'surface', 'raised'] as const;

export const CONTRAST_PAIRS: ContrastPair[] = [
  ...TEXTS.flatMap((t) => GROUNDS.map((g) => ({ name: `${t} on ${g}`, fg: (p: Palette) => p[t], bg: (p: Palette) => p[g], min: 4.5 as const }))),
  ...GROUNDS.map((g) => ({ name: `edgeAccent on ${g}`, fg: (p: Palette) => p.edgeAccent, bg: (p: Palette) => p[g], min: 4.5 as const })),
  { name: 'onGradient on accentFrom', fg: (p) => p.onGradient, bg: (p) => p.accentFrom, min: 4.5 },
  { name: 'onGradient on accentTo', fg: (p) => p.onGradient, bg: (p) => p.accentTo, min: 4.5 },
  ...TONES.map((t) => ({ name: `toneText on ${t}`, fg: (p: Palette) => toneText(p, t), bg: (p: Palette) => p[t], min: 4.5 as const })),
  // Inks are text on white HUD plates (light palette) and on Dark-mode lobby panels.
  ...INKS.map((k) => ({ name: `${k} on light raised`, fg: (p: Palette) => p[k], bg: (p: Palette) => p.raised, min: 4.5 as const, only: 'light' as const })),
  ...INKS.flatMap((k) => (['raised', 'surface'] as const).map((g) => ({ name: `${k} on dark ${g}`, fg: (p: Palette) => p[k], bg: (p: Palette) => p[g], min: 4.5 as const, only: 'dark' as const }))),
  // UI parts (bars, icons) on white plates.
  { name: 'you on light raised (UI)', fg: (p) => p.you, bg: (p) => p.raised, min: 3, only: 'light' },
  { name: 'rival on light raised (UI)', fg: (p) => p.rival, bg: (p) => p.raised, min: 3, only: 'light' },
  { name: 'winInk on light raised (UI)', fg: (p) => p.winInk, bg: (p) => p.raised, min: 3, only: 'light' },
];
