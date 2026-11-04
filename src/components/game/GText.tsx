import React from 'react';
import { Text, TextProps } from 'react-native';
import { typeMfm, typeStyle, type Palette, type TextVariant } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';

export type TextTone =
  | 'text' | 'muted' | 'dim' | 'accent' | 'onAccent' | 'onGradient'
  | 'you' | 'rival' | 'win' | 'loss' | 'draw'
  | 'youInk' | 'rivalInk' | 'winInk' | 'lossInk';

export interface GTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Overrides the variant's font size (line height scales with it). */
  size?: number;
  palette?: Palette;
}

const SMALL: TextVariant[] = ['label', 'caption', 'body', 'bodyStrong'];

function toneColor(c: Palette, tone: TextTone, variant: TextVariant): string {
  switch (tone) {
    case 'muted':
      return c.textMuted;
    case 'dim':
      return c.textDim;
    // Accent is only large text; small accent text uses the darker edgeAccent (contrast rule 1, both modes).
    case 'accent':
      return SMALL.includes(variant) ? c.edgeAccent : c.accent;
    case 'text':
      return c.text;
    default:
      return c[tone];
  }
}

/** Text in an Arena variant. Side/result-coloured text should use an *Ink tone; fill tones are for large text only. */
export const GText: React.FC<GTextProps> = ({ variant = 'body', tone = 'text', size, palette, style, maxFontSizeMultiplier, ...rest }) => {
  const c = usePalette(palette);
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? typeMfm(variant)}
      {...rest}
      style={[typeStyle(variant, size), { color: toneColor(c, tone, variant) }, style]}
    />
  );
};
