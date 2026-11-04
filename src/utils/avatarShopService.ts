import { supabase } from './supabase';
import type { UserProfile } from './profileService';
import { OUTFIT_ITEMS } from './avatarFaces.generated';

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
  /** Faces only: add a short-hair layer with volume in this colour (set in viewerConfig). */
  hairShell?: string;
  /** Material name part -> colour: repaints a textured material in that colour, keeping its detail
   * (the base body's near-black hair, where a tint would stay black; untextured cloth just takes the colour). */
  dye?: Record<string, string>;
  /** Characters only: the hero's story, signature moves and effect (the Shop's hero page). */
  hero?: HeroProfile;
  /** Characters only: tall portrait art for the Shop's hero cards, and the card's two background colours. */
  card?: string;
  cardColors?: [string, string];
  /** Characters only: the body's own look (skin tint, dyes), applied before any worn items. */
  look?: { tint?: Record<string, [number, number, number]>; dye?: Record<string, string> };
}

/** What makes a hero their own. Their model carries their own clips (scripts/blender/author_hero_clips.py):
 * hero_idle, the loop they play whenever they are on screen, and hero_move1 / hero_move2, their
 * signature moves; moves may also use a shared clip (squat). The effect colours the stage ring and the
 * sparks around each move. */
export interface HeroProfile {
  title: string;
  /** What they are, and what they are best at (the hero page header). */
  role: string;
  specialty: string;
  story: string;
  /** Their world on the hero page and in the story movie (avatarViewerHtml.ts WORLDS). */
  world: 'track' | 'trail' | 'cliff';
  /** The lobby's world when it differs (a climber walks the trail there), and the moves the lobby
   * plays between loops (motion-captured ones only). */
  lobbyWorld?: 'track' | 'trail' | 'cliff';
  lobbyMoves?: string[];
  stats: { label: string; value: number }[];
  /** The story movie: camera shots in order, each with a caption (StoryShot in AvatarViewer3D). */
  movie: { cam: string; dur: number; clip?: string; reps?: number; slow?: number; burst?: boolean; caption: string }[];
  /** icon: a lucide icon name the hero page knows (zap, flag, mountain, footprints, dumbbell). */
  moves: { clip: string; name: string; text: string; icon: string }[];
  effect: { name: string; color: string; text: string };
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
  /** Characters only: free once the player reaches this level (instead of a coin price). */
  unlock_level?: number | null;
}

export const DEFAULT_AVATAR_ID = 'starter_ojas_f';
/** The detailed CC body (scripts/blender/build_fc1.py). Every character but Arjun is a variant of it. */
export const BASE_BODY_URL = 'local://avatars/ojas_fc1.glb';
type BodyLook = NonNullable<ShopItemConfig['look']>;
// Skin tints are linear multipliers on the base body's (light) skin; dyes are sRGB colours.
const MEERA_LOOK: BodyLook = { tint: { skin_: [0.74, 0.58, 0.46] } };
const COACH_LOOK: BodyLook = { tint: { skin_: [0.66, 0.5, 0.39] }, dye: { sport_top: '#1D5FA8' } };
/** Simulated rivals: the base body in one of these looks (not characters anyone can pick). */
const RIVAL_LOOKS: BodyLook[] = [
  { tint: { skin_: [0.58, 0.43, 0.33] }, dye: { sport_top: '#0F7A64' } },
  { tint: { skin_: [0.95, 0.86, 0.78] }, dye: { hair_: '#9A6A3A', sport_top: '#5B2C83' } },
  { tint: { skin_: [0.48, 0.35, 0.27] }, dye: { sport_top: '#C2621F' } },
  { tint: { skin_: [0.82, 0.66, 0.54] }, dye: { sport_top: '#B76E79' } },
  { tint: { skin_: [0.86, 0.74, 0.64] }, dye: { hair_: '#8E3B1F', sport_top: '#1B2A4A' } },
  { tint: { skin_: [0.7, 0.55, 0.44] }, dye: { sport_top: '#A3122A' } },
  { dye: { hair_: '#C9A26B', sport_top: '#2E6B2E' } },
  { tint: { skin_: [0.62, 0.47, 0.36] }, dye: { hair_: '#6B2D8C', sport_top: '#E8E8EC' } },
  { tint: { skin_: [0.74, 0.58, 0.46] }, dye: { hair_: '#B0B4BC', sport_top: '#C9A227' } },
];
const ROCKETBOX_BODIES = ['local://avatars/ojas_default.glb', 'local://avatars/ojas_female.glb'];
const isRocketbox = (character: AvatarModel) => ROCKETBOX_BODIES.includes(character.model_url);
/** Removed from the shop, even while an older server still lists them. */
// face_m_18: its head model has no back of the skull (a face mask only), so it looked bald and
// hollow from behind. Hidden until the face is rebuilt. The char_* roster was retired: the shop
// keeps only Meera and Arjun.
const RETIRED_IDS = [
  'starter_aiko', 'face_m_18',
  'char_kavya', 'char_zoya', 'char_ishani', 'char_aarohi', 'char_naina', 'char_tara', 'char_elena', 'char_sana', 'char_rani',
];

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
    // The base character: the detailed CC-rigged body (scripts/blender/build_fc1.py) in Meera's look.
    // Faces and kits are built for Arjun's Rocketbox body, so only shoe colours fit her.
    id: DEFAULT_AVATAR_ID,
    name: 'Meera',
    description: 'Every athlete starts here. Earn coins for new gear.',
    rarity: 'common',
    price_coins: 0,
    category: 'character',
    character_id: null,
    model_url: BASE_BODY_URL,
    model_format: 'glb',
    config: {
      materials: { shoes: ['shoes_upper'] },
      look: MEERA_LOOK,
      card: 'local://avatars/meera_card.png',
      hero: {
        title: 'The Comeback Sprinter',
        role: 'Sprinter',
        specialty: 'Speed / Comeback',
        world: 'track',
        lobbyMoves: ['hero_move1'],
        stats: [
          { label: 'Speed', value: 0.92 },
          { label: 'Stamina', value: 0.72 },
          { label: 'Power', value: 0.58 },
          { label: 'Agility', value: 0.84 },
        ],
        movie: [
          { cam: 'wide', dur: 4, caption: 'Under the stadium lights, one runner is always first on the track.' },
          { cam: 'face', dur: 3.6, caption: 'Meera ran the 400 m for her college.' },
          { cam: 'feet', dur: 3.4, clip: 'hero_move1', caption: 'Every race, she was first off the line.' },
          { cam: 'back', dur: 4, clip: 'rest', slow: 0.6, caption: 'Then a knee injury took her off the track.' },
          { cam: 'low', dur: 4.4, clip: 'squat', caption: 'She rebuilt it one squat at a time, every morning before sunrise.' },
          { cam: 'orbit', dur: 4.6, clip: 'hero_move1', burst: true, caption: 'Now a setback is only the start of her comeback.' },
          { cam: 'hero', dur: 5.4, clip: 'hero_move2', burst: true, caption: '' },
        ],
        story:
          'Meera ran the 400 m for her college until a knee injury took her off the track. She rebuilt it one squat at a time, every morning before sunrise, and now she trains to show that a setback is only the start of a comeback.',
        moves: [
          { clip: 'hero_move1', name: 'Full Sprint', text: 'Flat out down the straight: long strides, big arm drive.', icon: 'zap' },
          { clip: 'hero_move2', name: 'Finish Line', text: 'Home down the straight, then one fist to the sky.', icon: 'flag' },
          { clip: 'squat', name: 'Sunrise Squat', text: 'Deep, steady reps: the drill that rebuilt her knee.', icon: 'dumbbell' },
        ],
        effect: { name: 'Pink Blaze', color: '#FF4FA3', text: 'Her ring glows pink, and sparks rise with every move.' },
      },
      cardColors: ['#E8458B', '#3B1E6E'],
    },
    thumbnail_url: 'local://avatars/fc1_meera.png',
    is_default: true,
    sort_order: -1,
  },
  // Arjun: the Survival Character (scripts/blender/build_arjun.py), on a CC-named copy of its own
  // Unreal skeleton with the starters' clips retargeted onto it.
  {
    id: 'starter_ojas',
    name: 'Arjun',
    description: 'Every athlete starts here. Earn coins for new gear.',
    rarity: 'common',
    price_coins: 0,
    category: 'character',
    character_id: null,
    model_url: 'local://avatars/arjun.glb',
    model_format: 'glb',
    config: {
      materials: { top: ['gear_upper'], pants: ['gear_lower'], shoes: ['gear_feet'] },
      card: 'local://avatars/arjun_card.png',
      hero: {
        title: 'The Mountain Trekker',
        role: 'Trekker',
        specialty: 'Endurance / Power',
        world: 'cliff',
        lobbyWorld: 'trail',
        lobbyMoves: [],
        stats: [
          { label: 'Speed', value: 0.48 },
          { label: 'Stamina', value: 0.93 },
          { label: 'Power', value: 0.82 },
          { label: 'Agility', value: 0.6 },
        ],
        movie: [
          { cam: 'wide', dur: 4.4, caption: 'High in the Himalaya, the last stretch to the summit is straight up.' },
          { cam: 'low', dur: 3.8, caption: 'Arjun climbs it the way he leads every trek: one hold at a time.' },
          { cam: 'face', dur: 3.6, caption: 'Below him, the valley drops away. He never looks down.' },
          { cam: 'feet', dur: 3.4, caption: 'Strong legs drive him up the rock.' },
          { cam: 'orbit', dur: 4.6, burst: true, caption: 'So between treks, he trains like the mountain is watching.' },
          { cam: 'hero', dur: 5, clip: 'cheer', burst: true, caption: '' },
        ],
        story:
          'Arjun guides treks through the Himalayan passes, and the last stretch to every summit is a climb. Strong legs keep his group safe on the rock, so between treks he trains like the mountain is watching.',
        moves: [
          { clip: 'hero_move1', name: 'Rock Scramble', text: 'Up a steep face: reach high, drive the knee, pull through.', icon: 'mountain' },
          { clip: 'hero_move2', name: 'Peak Reached', text: 'The last hard steps to the top, a look across the valley, fists up.', icon: 'flag' },
          { clip: 'squat', name: 'Summit Squat', text: 'Heavy, controlled reps for the climb ahead.', icon: 'dumbbell' },
        ],
        effect: { name: 'Ember Trail', color: '#FF9A2E', text: 'A campfire glow on his ring, embers rising with every move.' },
      },
      cardColors: ['#E0962A', '#3A2414'],
    },
    thumbnail_url: 'local://avatars/arjun.png',
    is_default: false,
    sort_order: 0,
  },
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
    // A row that points at an on-device file (local://) only works if this app version ships that
    // file. The server still lists faces this version dropped (m_15, m_17, m_19, m_21): those had no
    // thumbnail or model, so the shop showed blank cards. Keep local rows only when bundled here.
    const bundledIds = new Set(BUNDLED_AVATARS.map((b) => b.id));
    const usesLocalFile = (row: any) =>
      [row.model_url, row.thumbnail_url, row.config?.model_url].some((u) => typeof u === 'string' && u.startsWith('local://'));
    const rows = data
      .filter((row: any) => !RETIRED_IDS.includes(row.id))
      // Faces were retired: each character keeps its own face only.
      .filter((row: any) => row.category !== 'face')
      .filter((row: any) => !usesLocalFile(row) || bundledIds.has(row.id))
      .map((row: any) => ({
      ...row,
      category: row.category ?? 'character',
      character_id: row.character_id ?? null,
      model_url: row.model_url ?? '',
      config: row.config ?? {},
      // A starter's body ships with this app version: its model, look and card follow the app.
      ...(() => {
        const own = BUNDLED_AVATARS.find((b) => b.id === row.id && b.category === 'character');
        return own ? { model_url: own.model_url, model_format: own.model_format, config: own.config, thumbnail_url: own.thumbnail_url } : {};
      })(),
    })) as AvatarModel[];
    // Items bundled with this app version that the server doesn't list yet (its migration hasn't
    // run): still shown for try-on, flagged so the shop does not offer to sell them.
    const extras = BUNDLED_AVATARS.filter((b) => !rows.some((r) => r.id === b.id));
    // Stable sort, so a bundled item lands where its sort_order puts it (the base character first).
    return [...rows, ...extras.map((b) => ({ ...b, notOnServer: true }))].sort((a, b) => a.sort_order - b.sort_order);
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
  if (model.is_default || getOwnedAvatarIds(profile).includes(model.id)) return true;
  return model.price_coins === 0 && !model.unlock_level;
}

/** A level character the player has reached the level for (claimed on first use). */
export function isUnlockedByLevel(model: AvatarModel, level: number): boolean {
  return !!model.unlock_level && level >= model.unlock_level;
}

/** Starters: free from the start, no level or coins needed. */
export function isStarter(model: AvatarModel): boolean {
  return model.category === 'character' && model.price_coins === 0 && !model.unlock_level;
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
  // Faces and kits are GLBs fitted to the Rocketbox skeleton: only Rocketbox bodies can wear them
  // (Meera's base body and Arjun have skeletons of their own).
  if ((item.category === 'face' || item.category === 'kit') && item.config.model_url && !isRocketbox(character)) return false;
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
  const worn = LOADOUT_SLOTS.map((slot) => catalog.find((m) => m.id === loadout[slot]))
    .filter((m): m is AvatarModel => !!m && fitsCharacter(m, character));
  return [...baseLookItems(character), ...worn];
}

const lookItem = (id: string, look: BodyLook): AvatarModel =>
  item(`look_${id}`, 'Look', '', 'common', 0, 'kit', null, { tint: look.tint, dye: look.dye }, -100);

/** The character's own look (skin tone, dyes) as a loadout item, applied before anything worn. */
export function baseLookItems(character: AvatarModel): AvatarModel[] {
  return character.config.look ? [lookItem(character.id, character.config.look)] : [];
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

/** The AI rival: the base body in the coach's look (VS arena and the Human vs AI screen). */
export const AI_RIVAL_MODEL: AvatarModel = {
  id: 'ai_instructor',
  name: 'AI Coach',
  description: '',
  rarity: 'legendary',
  price_coins: 0,
  category: 'character',
  character_id: null,
  model_url: BASE_BODY_URL,
  model_format: 'glb',
  config: { look: COACH_LOOK },
  thumbnail_url: null,
  is_default: false,
  sort_order: 0,
};

/** A player's character and what it wears, from their profile (or the defaults). */
export function lookOf(catalog: AvatarModel[], profile: Pick<UserProfile, 'equipped_avatar_id' | 'equipped_items'> | null) {
  const model = findAvatar(catalog, getEquippedAvatarId(profile as UserProfile | null));
  return { model, items: loadoutItems(catalog, getLoadout(profile as UserProfile | null, model.id), model) };
}

/** A stable random look for a name (simulated rivals): the base body in one of the rival looks. */
export function lookForName(_catalog: AvatarModel[], name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  const model: AvatarModel = { ...AI_RIVAL_MODEL, id: 'rival', name: 'Rival', config: { look: RIVAL_LOOKS[h % RIVAL_LOOKS.length] } };
  return { model, items: baseLookItems(model) };
}
