import { supabase } from './supabase';
import type { UserProfile } from './profileService';
import { FACE_ITEMS, OUTFIT_ITEMS } from './avatarFaces.generated';

export type AvatarRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AvatarModelFormat = 'vrm' | 'glb';
/** kit = a whole outfit (another character's clothes fitted to this one), replacing its own clothes. */
export type ShopCategory = 'character' | 'face' | 'kit' | 'top' | 'pants' | 'shoes' | 'hair' | 'accessory';
export type LoadoutSlot = Exclude<ShopCategory, 'character'>;
export const LOADOUT_SLOTS: LoadoutSlot[] = ['face', 'kit', 'top', 'pants', 'shoes', 'hair', 'accessory'];
/** Slots a plain `color` item paints onto the character's own materials. */
export type ColorSlot = 'top' | 'pants' | 'shoes' | 'hair';
const COLOR_SLOTS: LoadoutSlot[] = ['top', 'pants', 'shoes', 'hair'];

/** How an item is applied in the 3D viewer (see avatarViewerHtml.ts). */
export interface ShopItemConfig {
  /** Characters only: material name parts that make up each slot, e.g. { top: ['Shirt'], hair: ['Hair'] }. */
  materials?: Partial<Record<ColorSlot, string[]>>;
  recolor?: Record<string, string>;
  builtin?: 'headband' | 'cap' | 'halo';
  color?: string;
  model_url?: string;
  hide?: string[];
  /** Linear RGB multipliers on the character's materials, e.g. a face item matching the skin tone. */
  tint?: Record<string, [number, number, number]>;
  bone?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  /** Colours shown on the shop card when there is no thumbnail. */
  swatch?: string[];
}

/** Any shop item: a character (body model) or a face / outfit / top / pants / shoes / hair / accessory for one. */
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

export const DEFAULT_AVATAR_ID = 'starter_ojas';
/** Removed from the shop, even while an older server still lists them. */
const RETIRED_IDS = ['starter_aiko'];

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
  // The two starters wear a plain outfit on purpose: tops, pants and shoes from the shop tint these
  // materials, and every face in the Faces tab is free (avatarFaces.generated.ts).
  {
    id: DEFAULT_AVATAR_ID,
    name: 'Arjun',
    description: 'Every athlete starts here. Pick a face and earn coins for new gear.',
    rarity: 'common',
    price_coins: 0,
    category: 'character',
    character_id: null,
    model_url: 'local://avatars/ojas_default.glb',
    model_format: 'glb',
    config: { materials: { top: ['ojas_top'], pants: ['ojas_pants'], shoes: ['ojas_shoes'] } },
    thumbnail_url: 'local://avatars/ojas_default.png',
    is_default: true,
    sort_order: 0,
  },
  {
    id: 'starter_ojas_f',
    name: 'Meera',
    description: 'Every athlete starts here. Pick a face and earn coins for new gear.',
    rarity: 'common',
    price_coins: 0,
    category: 'character',
    character_id: null,
    model_url: 'local://avatars/ojas_female.glb',
    model_format: 'glb',
    config: { materials: { top: ['ojas_top'], pants: ['ojas_pants'], shoes: ['ojas_shoes'] } },
    thumbnail_url: 'local://avatars/ojas_female.png',
    is_default: false,
    sort_order: 1,
  },
  ...FACE_ITEMS.map(([id, name, characterId, config, thumbnail, sort]) => ({
    ...item(id, name, 'A new look. Free to wear.', 'common', 0, 'face', characterId, config, sort),
    thumbnail_url: thumbnail,
  })),
  ...OUTFIT_ITEMS.map(([id, name, description, rarity, price, characterId, config, thumbnail, sort]) => ({
    ...item(id, name, description, rarity, price, 'kit', characterId, config, sort),
    thumbnail_url: thumbnail,
  })),
  item('top_midnight', 'Midnight Hoodie', 'Deep navy hoodie for late training sessions.', 'common', 120, 'top', null, { color: '#3B4A8C', swatch: ['#3B4A8C'] }, 10),
  item('top_mint', 'Mint Hoodie', 'Fresh mint hoodie.', 'common', 120, 'top', null, { color: '#7FD8B8', swatch: ['#7FD8B8'] }, 11),
  item('top_crimson', 'Crimson Top', 'Match-day crimson.', 'rare', 300, 'top', null, { color: '#C2283A', swatch: ['#C2283A'] }, 12),
  item('top_gold', 'Gold Varsity', 'Champion gold top.', 'epic', 650, 'top', null, { color: '#F2B829', swatch: ['#F2B829'] }, 13),
  item('pants_charcoal', 'Charcoal Joggers', 'Everyday training bottoms.', 'common', 100, 'pants', null, { color: '#3A3A44', swatch: ['#3A3A44'] }, 15),
  item('pants_white', 'Clean White', 'Crisp white bottoms.', 'common', 100, 'pants', null, { color: '#F4F4F6', swatch: ['#F4F4F6'] }, 16),
  item('pants_navy', 'Navy Track Pants', 'Classic track navy.', 'rare', 240, 'pants', null, { color: '#1F2A5C', swatch: ['#1F2A5C'] }, 17),
  item('pants_black', 'Black Pro', 'Black bottoms for the pros.', 'epic', 500, 'pants', null, { color: '#16161C', swatch: ['#16161C'] }, 18),
  item('shoes_white', 'White Runners', 'Clean white running shoes.', 'common', 90, 'shoes', null, { color: '#F4F4F6', swatch: ['#F4F4F6'] }, 25),
  item('shoes_volt', 'Volt Trainers', 'Bright volt trainers.', 'rare', 220, 'shoes', null, { color: '#C6F432', swatch: ['#C6F432'] }, 26),
  item('shoes_red', 'Red Sprinters', 'Fast red sprint shoes.', 'epic', 450, 'shoes', null, { color: '#E0303E', swatch: ['#E0303E'] }, 27),
  item('hair_jet', 'Jet Black', 'Glossy jet-black hair.', 'common', 100, 'hair', null, { color: '#3A3A46', swatch: ['#3A3A46'] }, 30),
  item('hair_auburn', 'Auburn', 'Warm auburn tones.', 'rare', 220, 'hair', null, { color: '#D9784F', swatch: ['#D9784F'] }, 31),
  item('hair_rose', 'Rose', 'Soft rose-pink hair.', 'epic', 420, 'hair', null, { color: '#F2A7C3', swatch: ['#F2A7C3'] }, 32),
  item('acc_headband', 'Sport Headband', 'Sweat-proof headband. Fits every character.', 'common', 90, 'accessory', null, { builtin: 'headband', color: '#E25822', swatch: ['#E25822'] }, 40),
  item('acc_cap', 'Training Cap', 'Classic training cap. Fits every character.', 'rare', 260, 'accessory', null, { builtin: 'cap', color: '#2A2470', swatch: ['#2A2470', '#FFFFFF'] }, 41),
  item('acc_halo', 'Golden Halo', 'Only for the most dedicated athletes.', 'legendary', 1200, 'accessory', null, { builtin: 'halo', color: '#FBBF24', swatch: ['#FBBF24'] }, 42),
];

export const LOCAL_ASSET_ORIGIN = 'http://127.0.0.1:8888';
/** LocalAssetServer marks assets immutable for a year, so WebViews kept old copies after an app
 * update. One query per launch, the same for every view: within a launch, a model the VS card or
 * the shop already downloaded comes from the WebView cache when the match loads it. */
export const ASSET_BUST = `?v=${Date.now().toString(36)}`;

/** Face and outfit GLBs live in the Supabase `avatar-models` bucket, not the APK (scripts/upload-avatar-models.mjs).
 * Catalog rows keep their `local://avatars/faces|outfits/x.glb` urls; they resolve here. */
const REMOTE_MODEL_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://locsjrjekkyjbeapgreu.supabase.co'}/storage/v1/object/public/avatar-models`;
const REMOTE_MODEL_PATH = /^avatars\/(faces|outfits)\/[^/]+\.glb$/;
/** Bump when the bucket files change. Stable across launches so the WebView cache keeps the download. */
const REMOTE_MODEL_VERSION = '1';

/** Turns a catalog `model_url` (or thumbnail) into something the WebView can fetch. */
export function resolveModelUrl(modelUrl: string): string {
  if (modelUrl.startsWith('local://')) {
    const path = modelUrl.slice('local://'.length);
    if (REMOTE_MODEL_PATH.test(path)) return `${REMOTE_MODEL_BASE}/${path}?v=${REMOTE_MODEL_VERSION}`;
    return `${LOCAL_ASSET_ORIGIN}/${path}${ASSET_BUST}`;
  }
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
    const rows = data.filter((row: any) => !RETIRED_IDS.includes(row.id)).map((row: any) => ({
      ...row,
      category: row.category ?? 'character',
      character_id: row.character_id ?? null,
      model_url: row.model_url ?? '',
      config: row.config ?? {},
    })) as AvatarModel[];
    // Items bundled with this app version that the server doesn't list yet (its migration hasn't
    // run): still shown for try-on, flagged so the shop does not offer to sell them.
    const extras = BUNDLED_AVATARS.filter((b) => !rows.some((r) => r.id === b.id));
    return [...rows, ...extras.map((b) => ({ ...b, notOnServer: true }))];
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

function isColorItem(item: AvatarModel): boolean {
  return COLOR_SLOTS.includes(item.category as LoadoutSlot) && !!item.config.color && !item.config.recolor && !item.config.model_url;
}

/** Whether the item can be worn by this character. Colour items need the character to map that slot. */
export function fitsCharacter(item: AvatarModel, character: AvatarModel): boolean {
  if (item.category === 'character') return false;
  if (item.character_id !== null && item.character_id !== character.id) return false;
  if (isColorItem(item)) return !!character.config.materials?.[item.category as ColorSlot]?.length;
  return true;
}

/** The item as the viewer applies it: colour items become a recolour of the character's slot materials. */
export function viewerConfig(item: AvatarModel, character: AvatarModel): ShopItemConfig {
  if (!isColorItem(item)) return item.config;
  const parts = character.config.materials?.[item.category as ColorSlot] ?? [];
  return { ...item.config, recolor: Object.fromEntries(parts.map((part) => [part, item.config.color!])) };
}

export type Loadout = Partial<Record<LoadoutSlot, string>>;

/** Item ids the user has on for this character, by slot. */
export function getLoadout(profile: UserProfile | null, characterId: string): Loadout {
  return (profile?.equipped_items?.[characterId] as Loadout) ?? {};
}

/** Resolves a loadout to catalog items, dropping anything unknown or for another character. */
export function loadoutItems(catalog: AvatarModel[], loadout: Loadout, character: AvatarModel): AvatarModel[] {
  return LOADOUT_SLOTS.map((slot) => catalog.find((m) => m.id === loadout[slot]))
    .filter((m): m is AvatarModel => !!m && fitsCharacter(m, character));
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

/** The AI rival's body on the VS screen: the coach model with its warm-up idle. */
export const AI_RIVAL_MODEL: AvatarModel = {
  id: 'ai_instructor',
  name: 'AI Coach',
  description: '',
  rarity: 'legendary',
  price_coins: 0,
  category: 'character',
  character_id: null,
  model_url: 'local://avatars/instructor_ai.glb',
  model_format: 'glb',
  config: {},
  thumbnail_url: null,
  is_default: false,
  sort_order: 0,
};

/** A player's character and what it wears, from their profile (or the defaults). */
export function lookOf(catalog: AvatarModel[], profile: Pick<UserProfile, 'equipped_avatar_id' | 'equipped_items'> | null) {
  const model = findAvatar(catalog, getEquippedAvatarId(profile as UserProfile | null));
  return { model, items: loadoutItems(catalog, getLoadout(profile as UserProfile | null, model.id), model) };
}

/** A stable random look for a name (simulated rivals): character, face and maybe an outfit. */
export function lookForName(catalog: AvatarModel[], name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  const pick = <T,>(list: T[], salt: number): T | undefined =>
    list.length ? list[((h ^ Math.imul(salt, 2654435761)) >>> 0) % list.length] : undefined;
  const starters = catalog.filter((m) => m.category === 'character');
  const model = pick(starters, 1) ?? BUNDLED_AVATARS[0];
  const fits = (cat: string) => catalog.filter((m) => m.category === cat && m.character_id === model.id);
  const items = [pick(fits('face'), 2), (h >> 3) % 3 ? pick(fits('kit'), 3) : undefined].filter(
    (m): m is AvatarModel => !!m,
  );
  return { model, items };
}
