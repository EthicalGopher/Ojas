// Text styles for the Arena variants (design 3.2). Call typeStyle() only while rendering or inside a
// makeStyles factory: both run after App.tsx has resolved the fonts.
import type { TextStyle } from 'react-native';
import { fontsAvailable } from './fonts';
import { VARIANTS, buildTypeStyle, type TextVariant } from './typeSpec';

export type { TextVariant, VariantSpec } from './typeSpec';

const cache = new Map<string, TextStyle>();

export function typeStyle(variant: TextVariant, size?: number): TextStyle {
  const ok = fontsAvailable();
  const key = `${variant}:${size ?? ''}:${ok ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const style = buildTypeStyle(VARIANTS[variant], ok, size);
  cache.set(key, style);
  return style;
}

export function typeMfm(variant: TextVariant): number | undefined {
  return VARIANTS[variant].mfm;
}
