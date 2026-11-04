import React from 'react';
import { View } from 'react-native';
import { softShadow, type Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GText } from './GText';

export interface NamePlateProps {
  name: string;
  /** Small line under the name, e.g. "Lv 6 · Warrior". */
  tag?: string | null;
  side?: 'you' | 'rival' | 'neutral';
  size?: 'sm' | 'md';
  maxWidth?: number;
  palette?: Palette;
}

/** Pill under a character: name, tag line and a side-coloured stripe (design 3.3, 3.10). */
export const NamePlate: React.FC<NamePlateProps> = ({ name, tag, side = 'neutral', size = 'md', maxWidth = 160, palette }) => {
  const c = usePalette(palette);
  const height = size === 'sm' ? 40 : 52;
  const stripe = side === 'you' ? c.you : side === 'rival' ? c.rival : null;
  return (
    // The shadow sits on this wrapper; the inner pill clips the stripe, so the shadow is not clipped.
    <View style={[{ borderRadius: height / 2, maxWidth, alignSelf: 'center' }, softShadow(c)]}>
      <View
        style={{
          height,
          borderRadius: height / 2,
          overflow: 'hidden',
          backgroundColor: c.raised,
          borderWidth: 1,
          borderColor: c.edge,
          paddingHorizontal: 14,
          justifyContent: 'center',
        }}
      >
        {stripe && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: stripe }} />}
        <GText
          variant={size === 'sm' ? 'label' : 'title'}
          palette={c}
          numberOfLines={1}
          ellipsizeMode="tail"
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {name}
        </GText>
        {!!tag && (
          <GText variant="caption" tone="muted" palette={c} numberOfLines={1}>
            {tag}
          </GText>
        )}
      </View>
    </View>
  );
};
