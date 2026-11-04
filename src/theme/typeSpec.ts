// Typography spec (design 3.2). Only type imports, so Node can run src/theme/theme.test.mjs.
import type { TextStyle } from 'react-native';
import type { FontKey } from './fonts';

export type TextVariant = 'hero' | 'display' | 'title' | 'label' | 'body' | 'bodyStrong' | 'caption' | 'number';

export interface VariantSpec {
  font: FontKey;
  fallbackWeight: TextStyle['fontWeight'];
  fallbackItalic: boolean;
  size: number;
  line: number;
  spacing: number;
  upper: boolean;
  mfm?: number;
}

/** Font family names registered by expo-font (the keys of FONT in fonts.ts). */
export const FONT_FAMILIES: Record<FontKey, string> = {
  blackItalic: 'Nunito_900Black_Italic',
  extraBold: 'Nunito_800ExtraBold',
  bold: 'Nunito_700Bold',
  semi: 'Nunito_600SemiBold',
};

export const VARIANTS: Record<TextVariant, VariantSpec> = {
  hero: { font: 'blackItalic', fallbackWeight: '900', fallbackItalic: true, size: 60, line: 62, spacing: 0, upper: true, mfm: 1.1 },
  display: { font: 'blackItalic', fallbackWeight: '900', fallbackItalic: true, size: 30, line: 34, spacing: 0, upper: false, mfm: 1.2 },
  title: { font: 'extraBold', fallbackWeight: '800', fallbackItalic: false, size: 20, line: 24, spacing: 0, upper: false, mfm: 1.3 },
  label: { font: 'extraBold', fallbackWeight: '800', fallbackItalic: false, size: 12, line: 16, spacing: 0.3, upper: false, mfm: 1.3 },
  body: { font: 'semi', fallbackWeight: '600', fallbackItalic: false, size: 15, line: 21, spacing: 0, upper: false },
  bodyStrong: { font: 'bold', fallbackWeight: '700', fallbackItalic: false, size: 15, line: 21, spacing: 0, upper: false },
  caption: { font: 'semi', fallbackWeight: '600', fallbackItalic: false, size: 12, line: 16, spacing: 0, upper: false, mfm: 1.5 },
  // Nunito digits are all 0.600 em wide, so numbers are tabular without fontVariant (spike 4.0).
  number: { font: 'blackItalic', fallbackWeight: '900', fallbackItalic: true, size: 28, line: 30, spacing: 0, upper: false, mfm: 1.2 },
};

/**
 * Style for a variant. With fonts the family carries weight and italics (Android needs that), so
 * fontWeight/fontStyle are left out; without fonts the system font gets the fallback weight/style.
 */
export function buildTypeStyle(spec: VariantSpec, fontsOk: boolean, size?: number): TextStyle {
  const fontSize = size ?? spec.size;
  const style: TextStyle = {
    fontSize,
    lineHeight: size === undefined ? spec.line : Math.round((size * spec.line) / spec.size),
    letterSpacing: spec.spacing,
  };
  if (spec.upper) style.textTransform = 'uppercase';
  if (fontsOk) {
    style.fontFamily = FONT_FAMILIES[spec.font];
  } else {
    style.fontWeight = spec.fallbackWeight;
    if (spec.fallbackItalic) style.fontStyle = 'italic';
  }
  return style;
}
