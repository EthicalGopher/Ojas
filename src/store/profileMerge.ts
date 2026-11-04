// Which profile the app should show after a read from the server. A failed read must never replace
// what we know with a blank profile: that shows the default hero, as if the player's choice was lost.

export interface SavedLook {
  equipped_avatar_id?: string;
  equipped_items?: Record<string, Record<string, string>>;
}

interface LoadedProfile extends SavedLook {
  /** Stand-in built on the device because the server's row could not be read. */
  load_failed?: boolean;
}

export function resolveProfile<P extends LoadedProfile>(current: P | null, fetched: P, saved: SavedLook | null): P {
  if (!fetched.load_failed) return fetched;
  if (current && !current.load_failed) return current;
  return { ...fetched, ...saved };
}
