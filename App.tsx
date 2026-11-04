import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { Appearance, View } from 'react-native';
import AppShell from './src/app/AppShell';
import { useGameFonts } from './src/theme/fonts';
import { initJuice } from './src/juice/juice';

export default function App() {
  const fontsResolved = useGameFonts(); // true once loaded, failed, or timed out (3 s)
  useEffect(() => {
    initJuice().catch(() => {});
  }, []);
  // The stored Light/Dark override is not read yet, so this follows the system scheme.
  if (!fontsResolved) return <View style={{ flex: 1, backgroundColor: Appearance.getColorScheme() === 'light' ? '#E9F6F4' : '#0E1726' }} />;
  return <AppShell />;
}
