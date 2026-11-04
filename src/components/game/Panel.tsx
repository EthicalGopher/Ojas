import React from 'react';
import { View, ViewProps } from 'react-native';
import { radius as R, softShadow, space, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GradientFill } from './Gradient';

export type PanelTone = 'default' | 'raised' | 'sunken' | 'accent' | 'you' | 'rival' | 'win' | 'loss' | 'draw';

export interface PanelProps extends ViewProps {
  tone?: PanelTone;
  radius?: number;
  padding?: number;
  shadow?: boolean;
  outline?: boolean;
  borderColor?: string;
  borderWidth?: number;
  palette?: Palette;
}

function fillFor(c: Palette, tone: PanelTone): string {
  switch (tone) {
    case 'raised':
      return c.raised;
    case 'sunken':
      return c.surfaceSunken;
    case 'accent':
      return c.accentFrom; // solid base under the gradient
    case 'you':
    case 'rival':
    case 'win':
    case 'loss':
    case 'draw':
      return c[tone];
    default:
      return c.surface;
  }
}

/** Rounded panel: soft shadow, 1 dp edge, top highlight line (design 3.3, 3.10). Text on coloured tones: toneText(). */
export const Panel: React.FC<PanelProps> = ({
  tone = 'default',
  radius = R.panel,
  padding = space.md,
  shadow = true,
  outline,
  borderColor,
  borderWidth,
  palette,
  style,
  children,
  ...rest
}) => {
  const c = usePalette(palette);
  const coloured = tone !== 'default' && tone !== 'raised' && tone !== 'sunken';
  const drawOutline = outline ?? !coloured;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: fillFor(c, tone),
          borderRadius: radius,
          padding,
          borderWidth: borderWidth ?? (drawOutline ? 1 : 0),
          borderColor: borderColor ?? c.edge,
        },
        shadow ? softShadow(c) : null,
        style,
      ]}
    >
      {tone === 'accent' && <GradientFill from={c.accentFrom} to={c.accentTo} radius={radius} />}
      {(tone === 'default' || tone === 'raised') && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 1.5, backgroundColor: c.highlight }} />
      )}
      {children}
    </View>
  );
};
