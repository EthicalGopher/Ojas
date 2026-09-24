import React from 'react';
import { StatusBar } from 'react-native';
import { useColors, useResolvedScheme } from '../theme';

/** Status bar whose icons stay readable in both light and dark mode. */
export const ThemedStatusBar: React.FC = () => {
  const scheme = useResolvedScheme();
  const colors = useColors();
  return <StatusBar barStyle={scheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={colors.bg} />;
};
