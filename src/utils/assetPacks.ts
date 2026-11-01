import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import {
  PackName,
  PackState,
  READY_STATE,
  UNKNOWN_STATE,
  normalizeReason,
  normalizeStatus,
} from './assetPacksLogic';

// JavaScript's view of the Play asset packs (heavy pose model, Tree Pose classifier). The native module is
// android/.../packs/AssetPackModule.kt. Off Android (web) every pack counts as ready. On Android a missing
// native module is a packaging mistake and must never look like "ready", so it reports `failed`.

const PACKS: PackName[] = ['pose_heavy', 'tree_pose'];
const FETCH_THROTTLE_MS = 3000;
const POLL_MS = 2000;
const MAX_POLLS = 10;
const EVENT = 'OjasAssetPackState';

const isAndroid = Platform.OS === 'android';
const native = isAndroid ? NativeModules.OjasAssetPacks : undefined;

/** Shown in a dev banner when the build simulates a pack state (-PpackFault); '' otherwise. */
export const PACK_DEV_FAULT: string = (native && native.devFault) || '';

const MISSING_MODULE_STATE: PackState = {
  status: 'failed',
  progress: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  errorCode: 0,
  reason: 'other',
};

let warnedMissing = false;
function warnMissing() {
  if (warnedMissing) return;
  warnedMissing = true;
  console.error('[assetPacks] the OjasAssetPacks native module is missing: AssetPackPackage is not registered');
}

function toState(m: any): PackState {
  return {
    status: normalizeStatus(String(m?.status ?? '')),
    progress: Number(m?.progress) || 0,
    downloadedBytes: Number(m?.downloadedBytes) || 0,
    totalBytes: Number(m?.totalBytes) || 0,
    errorCode: Number(m?.errorCode) || 0,
    reason: normalizeReason(String(m?.reason ?? '')),
  };
}

function allWith(state: PackState): Record<PackName, PackState> {
  return { pose_heavy: state, tree_pose: state };
}

export async function getPackStates(): Promise<Record<PackName, PackState>> {
  if (!isAndroid) return allWith(READY_STATE);
  if (!native) {
    warnMissing();
    return allWith(MISSING_MODULE_STATE);
  }
  const raw = await native.getStates();
  const out = allWith(UNKNOWN_STATE);
  for (const name of PACKS) out[name] = toState(raw?.[name]);
  return out;
}

const lastFetch: Partial<Record<PackName, number>> = {};

/** Ask Play to (re)start a pack's download. At most once per 3 s per pack. */
export async function fetchPack(name: PackName): Promise<void> {
  if (!native) return;
  const now = Date.now();
  const last = lastFetch[name];
  if (last !== undefined && now - last < FETCH_THROTTLE_MS) return;
  lastFetch[name] = now;
  await native.fetch(name);
}

/** Shows Play's "download over mobile data?" dialog (only ever from an explicit button). */
export async function showPackConfirmation(): Promise<void> {
  if (!native) return;
  await native.showConfirmation();
}

export function subscribePackStates(cb: (name: PackName, state: PackState) => void): () => void {
  if (!native) return () => {};
  const emitter = new NativeEventEmitter(native);
  const sub = emitter.addListener(EVENT, (e: any) => {
    const name = e?.name as PackName;
    if (PACKS.includes(name)) cb(name, toState(e));
  });
  return () => sub.remove();
}

/**
 * The live state of one pack. Starts `unknown` on Android (`ready` elsewhere), subscribes first, then pulls
 * getStates() once (and again every 2 s, at most 10 times, while still `unknown`); an event that arrives
 * during a pull wins over the pulled value. It never starts a download itself.
 */
export function usePack(name: PackName): PackState {
  const [state, setState] = useState<PackState>(() => {
    if (!isAndroid) return READY_STATE;
    if (!native) {
      warnMissing();
      return MISSING_MODULE_STATE;
    }
    return UNKNOWN_STATE;
  });
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    if (!native) return;
    let alive = true;
    let eventVersion = 0;
    let inFlight = false;
    let polls = 0;

    const unsubscribe = subscribePackStates((n, s) => {
      if (!alive || n !== name) return;
      eventVersion += 1;
      setState(s);
    });

    const pull = async () => {
      if (inFlight) return;
      inFlight = true;
      const versionAtStart = eventVersion;
      try {
        const all = await getPackStates();
        if (alive && eventVersion === versionAtStart) setState(all[name]);
      } catch (e) {
        // keep the current state; the next poll or event updates it
      } finally {
        inFlight = false;
      }
    };

    pull();
    const timer = setInterval(() => {
      if (statusRef.current !== 'unknown' || polls >= MAX_POLLS) return;
      polls += 1;
      pull();
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [name]);

  return state;
}
