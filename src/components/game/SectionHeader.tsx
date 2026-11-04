import React from 'react';
import { Pressable, View } from 'react-native';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GText } from './GText';

/** Icon + title with Ojas's accent bar mark under the start of the title (design 3.3, 3.10). */
export const SectionHeader: React.FC<{
  title: string;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  action?: { label: string; onPress: () => void };
  palette?: Palette;
}> = ({ title, icon: Icon, action, palette }) => {
  const c = usePalette(palette);
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={20} color={c.accent} />}
        <GText variant="title" palette={c} style={{ flex: 1 }} numberOfLines={1}>
          {title}
        </GText>
        {action && (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={8}>
            <GText variant="label" tone="accent" palette={c}>
              {action.label}
            </GText>
          </Pressable>
        )}
      </View>
      <View style={{ marginTop: 4, marginLeft: Icon ? 28 : 0, width: 32, height: 3, borderRadius: 1.5, backgroundColor: c.accentFrom }} />
    </View>
  );
};
