import { supabase } from './supabase';
import type { UserProfile } from './profileService';

export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AvatarModelFormat = 'vrm' | 'glb';
export type ShopCategory = 'character' | 'outfit' | 'hair' | 'accessory';
export type LoadoutSlot = Exclude<ShopCategory, 'character'>;
export const LOADOUT_SLOTS: LoadoutSlot[] = ['outfit', 'hair', 'accessory'];

/** How a non-character item is applied in the 3D viewer (see avatarViewerHtml.ts). */
export interface ShopItemConfig {
  recolor?: Record<string, string>;
  builtin?: 'headband' | 'cap' | 'halo';
  color?: string;
  model_url?: string;
  hide?: string[];
  bone?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** Colours shown on the shop card when there is no thumbnail. */
  swatch?: string[];
}

/** Any shop item: a character (body model) or an outfit / hair / accessory for one. */
export interface AvatarModel {
  id: string;
  name: string;
  description: string;
  rarity: AvatarRarity;
  price_coins: number;
  category: ShopCategory;
  /** The character this item fits; null = fits every character. */
  character_id: string | null;
  /** Characters only: `local://avatars/x.vrm` for bundled models, otherwise a full https URL. */
  model_url: string;
  model_format: AvatarModelFormat;
  config: ShopItemConfig;
  thumbnail_url?: string | null;
  is_default: boolean;
  sort_order: number;
  /** Shown from the bundled catalog because the server has not been upgraded yet; cannot be bought. */
  notOnServer?: boolean;
}

export const DEFAULT_AVATAR_ID = 'starter_aiko';

const item = (
  id: string,
  name: string,
  description: string,
  rarity: AvatarRarity,
  price_coins: number,
  category: LoadoutSlot,
  character_id: string | null,
  config: ShopItemConfig,
  sort_order: number,
): AvatarModel => ({
  id, name, description, rarity, price_coins, category, character_id, config, sort_order,
  model_url: '', model_format: 'glb', thumbnail_url: null, is_default: false,
});

/** Mirrors the seeded rows so the shop works offline and for guests. */
export const BUNDLED_AVATARS: AvatarModel[] = [
  {
    id: DEFAULT_AVATAR_ID,
    name: 'Aiko',
    description: 'Your first training partner. Free for every athlete.',
    rarity: 'common',
    price_coins: 0,
    category: 'character',
    character_id: null,
    model_url: 'local://avatars/girl_model1.vrm',
    model_format: 'vrm',
    config: {},
    thumbnail_url: null,
    is_default: true,
    sort_order: 0,
  },
  item('aiko_hoodie_midnight', 'Midnight Hoodie', 'Deep navy hoodie for late training sessions.', 'common', 120, 'outfit', DEFAULT_AVATAR_ID, { recolor: { Tops: '#3B4A8C' }, swatch: ['#3B4A8C', '#FFFFFF'] }, 10),
  item('aiko_hoodie_mint', 'Mint Hoodie', 'Fresh mint hoodie with clean white shorts.', 'common', 120, 'outfit', DEFAULT_AVATAR_ID, { recolor: { Tops: '#7FD8B8' }, swatch: ['#7FD8B8', '#FFFFFF'] }, 11),
  item('aiko_hoodie_crimson', 'Crimson Set', 'Crimson hoodie with charcoal shorts. Match-day colours.', 'rare', 300, 'outfit', DEFAULT_AVATAR_ID, { recolor: { Tops: '#C2283A', Onepiece: '#3A3A44' }, swatch: ['#C2283A', '#3A3A44'] }, 12),
  item('aiko_varsity_gold', 'Gold Varsity', 'Champion gold top with black shorts.', 'epic', 650, 'outfit', DEFAULT_AVATAR_ID, { recolor: { Tops: '#F2B829', Onepiece: '#1E1E26' }, swatch: ['#F2B829', '#1E1E26'] }, 13),
  item('aiko_hair_jet', 'Jet Black', 'Glossy jet-black hair.', 'common', 100, 'hair', DEFAULT_AVATAR_ID, { recolor: { HAIR: '#3A3A46' }, swatch: ['#3A3A46'] }, 20),
  item('aiko_hair_auburn', 'Auburn', 'Warm auburn tones.', 'rare', 220, 'hair', DEFAULT_AVATAR_ID, { recolor: { HAIR: '#D9784F' }, swatch: ['#D9784F'] }, 21),
  item('aiko_hair_rose', 'Rose', 'Soft rose-pink hair.', 'epic', 420, 'hair', DEFAULT_AVATAR_ID, { recolor: { HAIR: '#F2A7C3' }, swatch: ['#F2A7C3'] }, 22),
  item('acc_headband', 'Sport Headband', 'Sweat-proof headband. Fits every character.', 'common', 90, 'accessory', null, { builtin: 'headband', color: '#E25822', swatch: ['#E25822'] }, 30),
  item('acc_cap', 'Training Cap', 'Classic training cap. Fits every character.', 'rare', 260, 'accessory', null, { builtin: 'cap', color: '#2A2470', swatch: ['#2A2470', '#FFFFFF'] }, 31),
  item('acc_halo', 'Golden Halo', 'Only for the most dedicated athletes.', 'legendary', 1200, 'accessory', null, { builtin: 'halo', color: '#FBBF24', swatch: ['#FBBF24'] }, 32),
];

export const LOCAL_ASSET_ORIGIN = 'http://127.0.0.1:8888';

/** Turns a catalog `model_url` into something the WebView can fetch. */
export function resolveModelUrl(modelUrl: string): string {
  if (modelUrl.startsWith('local://')) return `${LOCAL_ASSET_ORIGIN}/${modelUrl.slice('local://'.length)}`;
  return modelUrl;
}

export async function fetchAvatarCatalog(): Promise<AvatarModel[]> {
  try {
    const { data, error } = await supabase
      .from('avatar_models')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('price_coins', { ascending: true });
    if (error || !data || data.length === 0) return BUNDLED_AVATARS;
    const rows = data.map((row: any) => ({
      ...row,
      category: row.category ?? 'character',
      character_id: row.character_id ?? null,
      model_url: row.model_url ?? '',
      config: row.config ?? {},
    })) as AvatarModel[];
    // Server without the categories migration: still show the bundled outfits/hair/accessories
    // for try-on, flagged so the shop does not offer to sell them yet.
    if (!('category' in data[0])) {
      const extras = BUNDLED_AVATARS.filter((b) => b.category !== 'character' && !rows.some((r) => r.id === b.id));
      return [...rows, ...extras.map((b) => ({ ...b, notOnServer: true }))];
    }
    return rows;
  } catch {
    return BUNDLED_AVATARS;
  }
}

export function getOwnedAvatarIds(profile: UserProfile | null): string[] {
  const owned = profile?.owned_avatar_ids ?? [];
  return owned.includes(DEFAULT_AVATAR_ID) ? owned : [DEFAULT_AVATAR_ID, ...owned];
}

export function getEquippedAvatarId(profile: UserProfile | null): string {
  return profile?.equipped_avatar_id || DEFAULT_AVATAR_ID;
}

export function isAvatarOwned(profile: UserProfile | null, model: AvatarModel): boolean {
  return model.is_default || model.price_coins === 0 || getOwnedAvatarIds(profile).includes(model.id);
}

/** The character with this id, falling back to the default character. */
export function findAvatar(catalog: AvatarModel[], id: string): AvatarModel {
  const characters = catalog.filter((m) => m.category === 'character');
  return characters.find((m) => m.id === id) ?? characters.find((m) => m.is_default) ?? BUNDLED_AVATARS[0];
}

export function fitsCharacter(item: AvatarModel, characterId: string): boolean {
  return item.category !== 'character' && (item.character_id === null || item.character_id === characterId);
}

export type Loadout = Partial<Record<LoadoutSlot, string>>;

/** Item ids the user has on for this character, by slot. */
export function getLoadout(profile: UserProfile | null, characterId: string): Loadout {
  return (profile?.equipped_items?.[characterId] as Loadout) ?? {};
}

/** Resolves a loadout to catalog items, dropping anything unknown or for another character. */
export function loadoutItems(catalog: AvatarModel[], loadout: Loadout, characterId: string): AvatarModel[] {
  return LOADOUT_SLOTS.map((slot) => catalog.find((m) => m.id === loadout[slot]))
    .filter((m): m is AvatarModel => !!m && fitsCharacter(m, characterId));
}

interface ShopResult {
  ok: boolean;
  error?: string;
  coinsBalance?: number;
}

function missingSchemaMessage(message: string): string {
  return /function .* does not exist|Could not find the function/i.test(message)
    ? 'The avatar shop is not set up on the server yet.'
    : message;
}

/** Buys (and equips) a model. The server checks the coin balance. */
export async function purchaseAvatar(avatarId: string): Promise<ShopResult> {
  const { data, error } = await supabase.rpc('purchase_avatar', { p_avatar_id: avatarId });
  if (error) return { ok: false, error: missingSchemaMessage(error.message) };
  return { ok: data?.ok === true, error: data?.error, coinsBalance: data?.coins_balance };
}

export async function unequipSlot(slot: LoadoutSlot): Promise<ShopResult> {
  const { data, error } = await supabase.rpc('unequip_avatar_slot', { p_slot: slot });
  if (error) return { ok: false, error: missingSchemaMessage(error.message) };
  return { ok: data?.ok === true, error: data?.error };
}

export async function equipAvatar(avatarId: string): Promise<ShopResult> {
  const { data, error } = await supabase.rpc('equip_avatar', { p_avatar_id: avatarId });
  if (error) return { ok: false, error: missingSchemaMessage(error.message) };
  return { ok: data?.ok === true, error: data?.error };
}
