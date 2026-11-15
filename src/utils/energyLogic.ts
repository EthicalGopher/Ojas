// Match energy (Shadow Fight 2 style). No imports, so energyLogic.test.mjs can run it under Node.
// Same rules as get_energy() / spend_energy() in
// supabase/migrations/20261115120000_energy_and_match_history.sql: keep the numbers in step.

/** Bars of energy when full. */
export const ENERGY_MAX = 5;
/** One bar comes back every 10 minutes. */
export const ENERGY_REGEN_MS = 10 * 60 * 1000;
/** Each match uses one bar. */
export const ENERGY_COST = 1;

/** What is stored: the energy at `updatedAt` (ms). A full bar keeps its clock at "now". */
export interface EnergySnapshot {
  energy: number;
  updatedAt: number;
}

export interface EnergyNow {
  energy: number;
  max: number;
  /** ms until the next bar comes back; null when full. */
  msToNext: number | null;
  /** ms until every bar is back; 0 when full. */
  msToFull: number;
}

function clampEnergy(n: number): number {
  if (!Number.isFinite(n)) return ENERGY_MAX;
  return Math.max(0, Math.min(ENERGY_MAX, Math.floor(n)));
}

/** Adds the bars earned since the snapshot (whole 10-minute steps) and moves the clock to match. */
export function refill(snap: EnergySnapshot, now: number): EnergySnapshot {
  let energy = clampEnergy(snap.energy);
  let updatedAt = Number.isFinite(snap.updatedAt) ? Math.min(snap.updatedAt, now) : now;
  if (energy >= ENERGY_MAX) return { energy: ENERGY_MAX, updatedAt: now };
  const gained = Math.floor((now - updatedAt) / ENERGY_REGEN_MS);
  if (gained > 0) {
    energy = Math.min(ENERGY_MAX, energy + gained);
    updatedAt = energy >= ENERGY_MAX ? now : updatedAt + gained * ENERGY_REGEN_MS;
  }
  return { energy, updatedAt };
}

/** The energy the player has right now, with the refill timers. */
export function energyAt(snap: EnergySnapshot, now: number): EnergyNow {
  const s = refill(snap, now);
  if (s.energy >= ENERGY_MAX) return { energy: ENERGY_MAX, max: ENERGY_MAX, msToNext: null, msToFull: 0 };
  const msToNext = Math.max(0, s.updatedAt + ENERGY_REGEN_MS - now);
  return {
    energy: s.energy,
    max: ENERGY_MAX,
    msToNext,
    msToFull: msToNext + (ENERGY_MAX - s.energy - 1) * ENERGY_REGEN_MS,
  };
}

/** Uses one bar. ok = false (snapshot unchanged apart from the refill) when the bar is empty. */
export function spend(snap: EnergySnapshot, now: number): { ok: boolean; snap: EnergySnapshot } {
  const s = refill(snap, now);
  if (s.energy < ENERGY_COST) return { ok: false, snap: s };
  // a full bar starts its refill clock now
  const updatedAt = s.energy >= ENERGY_MAX ? now : s.updatedAt;
  return { ok: true, snap: { energy: s.energy - ENERGY_COST, updatedAt } };
}

/** Reads a stored snapshot (device copy for guests); anything unreadable counts as a full bar. */
export function parseSnapshot(raw: string | null, now: number): EnergySnapshot {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && Number.isFinite(v.energy) && Number.isFinite(v.updatedAt)) {
      return { energy: clampEnergy(v.energy), updatedAt: Math.min(v.updatedAt, now) };
    }
  } catch {
    // fall through
  }
  return { energy: ENERGY_MAX, updatedAt: now };
}

/** "9:05" for a countdown; "1:02:03" past an hour. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
