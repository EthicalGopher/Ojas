import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { GradientFill } from './Gradient';

/** Vertical bgTop -> bg gradient behind a screen. */
export const ScreenBackground: React.FC<{ palette?: Palette; children?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  palette,
  children,
  style,
}) => {
  const c = usePalette(palette);
  return (
    <View style={[styles.root, { backgroundColor: c.bg }, style]}>
      <GradientFill from={c.bgTop} to={c.bg} direction="vertical" />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({ root: { flex: 1 } });
