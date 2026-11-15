// Match energy: 5 bars, one used per match, one back every 10 minutes (rules in utils/energyLogic.ts).
// Signed-in players: the server owns the count (get_energy / spend_energy). Guests, or when the
// server functions are not reachable: a copy on the device.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '../utils/supabase';
import { ENERGY_COST, EnergyNow, EnergySnapshot, energyAt, parseSnapshot, spend as spendLocal } from '../utils/energyLogic';

const deviceKey = (userKey: string) => `ojas_energy_${userKey}`;

interface EnergyState {
  snap: EnergySnapshot;
  /** server clock minus device clock (ms), so refill timers follow the server */
  offset: number;
  source: 'server' | 'device';
  userKey: string | null;
  loaded: boolean;
  /** Reads the energy for this player (call on sign-in and when the app comes back). */
  load: (userId: string | null, isGuest: boolean) => Promise<void>;
  /** Uses one bar for a match that has started. False when the bar was empty. */
  spend: () => Promise<boolean>;
}

const now = (offset: number) => Date.now() + offset;

function fromServer(data: any): { snap: EnergySnapshot; offset: number } | null {
  const updatedAt = Date.parse(data?.updated_at);
  const serverNow = Date.parse(data?.server_now);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(serverNow) || !Number.isFinite(Number(data?.energy))) return null;
  return { snap: { energy: Number(data.energy), updatedAt }, offset: serverNow - Date.now() };
}

async function readDevice(userKey: string): Promise<EnergySnapshot> {
  try {
    return parseSnapshot(await AsyncStorage.getItem(deviceKey(userKey)), Date.now());
  } catch {
    return parseSnapshot(null, Date.now());
  }
}

function saveDevice(userKey: string | null, snap: EnergySnapshot) {
  if (!userKey) return;
  AsyncStorage.setItem(deviceKey(userKey), JSON.stringify(snap)).catch(() => {});
}

export const useEnergyStore = create<EnergyState>((set, get) => ({
  snap: { energy: 5, updatedAt: Date.now() },
  offset: 0,
  source: 'device',
  userKey: null,
  loaded: false,

  load: async (userId, isGuest) => {
    const userKey = userId ? (isGuest ? 'guest' : userId) : null;
    if (!userKey) {
      set({ userKey: null, loaded: false, source: 'device', offset: 0, snap: { energy: 5, updatedAt: Date.now() } });
      return;
    }
    if (get().userKey !== userKey) set({ userKey, loaded: false });
    if (!isGuest) {
      try {
        const { data, error } = await supabase.rpc('get_energy');
        const parsed = !error ? fromServer(data) : null;
        if (parsed) {
          if (get().userKey !== userKey) return;
          set({ ...parsed, source: 'server', loaded: true });
          saveDevice(userKey, parsed.snap);
          return;
        }
        if (error) console.warn('get_energy failed, using the device copy:', error.message);
      } catch (e) {
        console.warn('get_energy failed, using the device copy:', e);
      }
    }
    const snap = await readDevice(userKey);
    if (get().userKey !== userKey) return;
    set({ snap, offset: 0, source: 'device', loaded: true });
  },

  spend: async () => {
    const { snap, offset, source, userKey } = get();
    const local = spendLocal(snap, now(offset));
    // show it at once; the server answer replaces it
    set({ snap: local.snap });
    saveDevice(userKey, local.snap);
    if (source !== 'server') return local.ok;
    try {
      const { data, error } = await supabase.rpc('spend_energy');
      const parsed = !error ? fromServer(data) : null;
      if (parsed && get().userKey === userKey) {
        set(parsed);
        saveDevice(userKey, parsed.snap);
        return !!data?.ok;
      }
      if (error) console.warn('spend_energy failed:', error.message);
    } catch (e) {
      console.warn('spend_energy failed:', e);
    }
    return local.ok;
  },
}));

/** Energy right now (no re-render on its own). */
export function getEnergyNow(): EnergyNow {
  const { snap, offset } = useEnergyStore.getState();
  return energyAt(snap, now(offset));
}

/** True when the player has enough energy for a match. */
export function hasEnergyForMatch(): boolean {
  return getEnergyNow().energy >= ENERGY_COST;
}

/** Energy right now, ticking every second while a bar is refilling. */
export function useEnergy(): EnergyNow {
  const snap = useEnergyStore((s) => s.snap);
  const offset = useEnergyStore((s) => s.offset);
  const [t, setT] = useState(() => Date.now());
  const value = energyAt(snap, t + offset);
  const refilling = value.msToNext !== null;
  useEffect(() => {
    setT(Date.now());
    if (!refilling) return;
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, [refilling, snap]);
  return value;
}
