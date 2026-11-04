import React from 'react';
import { StatusBar } from 'react-native';
import { useColors, useResolvedScheme } from '../theme';

/** The app is a full-screen landscape game: the status bar stays hidden (icon colours kept for when it peeks in). */
export const ThemedStatusBar: React.FC = () => {
  const scheme = useResolvedScheme();
  const colors = useColors();
  return <StatusBar barStyle={scheme === 'light' ? 'dark-content' : 'light-content'} backgroundColor={colors.bg} hidden />;
};
