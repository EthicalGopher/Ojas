// Width estimate for MomentWord (Nunito Black Italic). Pure, no imports: see momentWordLayout.test.mjs.

/** Mean uppercase advance of Nunito Black Italic, used for glyphs missing from GLYPH_EM. */
export const DEFAULT_GLYPH_EM = 0.699;

/** Advance widths in em, measured with fontTools from Nunito_900Black_Italic.ttf (unitsPerEm 1000). */
export const GLYPH_EM: Record<string, number> = {
  A: 0.763, B: 0.702, C: 0.688, D: 0.786, E: 0.614, F: 0.579, G: 0.747, H: 0.786, I: 0.312, J: 0.39,
  K: 0.712, L: 0.585, M: 0.884, N: 0.757, O: 0.807, P: 0.676, Q: 0.807, R: 0.706, S: 0.651, T: 0.644,
  U: 0.748, V: 0.742, W: 1.128, X: 0.698, Y: 0.645, Z: 0.625,
  '0': 0.6, '1': 0.6, '2': 0.6, '3': 0.6, '4': 0.6, '5': 0.6, '6': 0.6, '7': 0.6, '8': 0.6, '9': 0.6,
  '!': 0.272, '#': 0.6, '.': 0.272, ':': 0.272, '?': 0.478, ' ': 0.286, '-': 0.445,
};

/** Slant overhang of the 9 degree italic (conservative). */
export const ITALIC_OVERHANG_EM = 0.2;
/** Both sides of the white stroke (0.12 em each). */
export const STROKE_EM = 0.24;

export function estimateWordWidth(text: string, size: number): number {
  if (!text) return 0;
  let em = 0;
  for (const ch of text.toUpperCase()) em += GLYPH_EM[ch] ?? DEFAULT_GLYPH_EM;
  return (em + ITALIC_OVERHANG_EM + STROKE_EM) * size;
}

/**
 * Largest integer size <= size whose estimate fits maxWidth, never below minSize. If it still does not
 * fit at minSize, the MomentWord viewBox scales the drawing down instead of clipping.
 */
export function fitWordSize(text: string, size: number, maxWidth: number, minSize: number = 24): number {
  if (!text) return size;
  const perPx = estimateWordWidth(text, 1);
  const fit = Math.floor(maxWidth / perPx);
  return Math.max(minSize, Math.min(size, fit));
}
