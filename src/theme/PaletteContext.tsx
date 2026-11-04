import React, { createContext, useContext } from 'react';
import type { Palette } from './palettes';
import { useColors } from './index';

const PaletteContext = createContext<Palette | null>(null);

/** Pins a palette for a subtree (match and camera screens use the light palette whatever the app theme). */
export const PaletteProvider: React.FC<{ palette: Palette; children: React.ReactNode }> = ({ palette, children }) => (
  <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>
);

/** override ?? nearest PaletteProvider ?? the app theme. */
export function usePalette(override?: Palette): Palette {
  const pinned = useContext(PaletteContext);
  const app = useColors();
  return override ?? pinned ?? app;
}
