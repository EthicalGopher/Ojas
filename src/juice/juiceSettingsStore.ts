import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_JUICE_SETTINGS, sanitizeSettings, type JuiceSettings } from './juiceLogic';

export const JUICE_SETTINGS_KEY = 'ojas.juice.settings';

interface JuiceSettingsState extends JuiceSettings {
  /** False until the saved settings were read (or the read failed); no music plays before that. */
  hydrated: boolean;
  set: (patch: Partial<JuiceSettings>) => void;
}

export const useJuiceSettings = create<JuiceSettingsState>((set, get) => ({
  ...DEFAULT_JUICE_SETTINGS,
  hydrated: false,
  set: (patch) => {
    set(patch);
    const { music, sfx, haptics, musicVolume } = get();
    AsyncStorage.setItem(JUICE_SETTINGS_KEY, JSON.stringify({ music, sfx, haptics, musicVolume })).catch(() => {});
  },
}));

AsyncStorage.getItem(JUICE_SETTINGS_KEY)
  .then((raw) => {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {}
    useJuiceSettings.setState({ ...sanitizeSettings(parsed), hydrated: true });
  })
  .catch(() => useJuiceSettings.setState({ hydrated: true }));
