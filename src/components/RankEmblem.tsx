// Custom vector rank emblems. Players get shields, squads get fortress crests.
// Both escalate with tier: more chevrons/towers, then gem + wings/laurels, crown, and a flame halo at the top tier.
import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

export type RankTier = 1 | 2 | 3 | 4 | 5 | 6;

interface TierPalette {
  light: string;
  base: string;
  dark: string;
}

export const TIER_PALETTES: Record<RankTier, TierPalette> = {
  1: { light: '#F3C08F', base: '#CD7F32', dark: '#6E3B12' }, // bronze
  2: { light: '#F8FAFC', base: '#A9B4C4', dark: '#4F5868' }, // silver
  3: { light: '#FEF08A', base: '#F5A90B', dark: '#8A3B0A' }, // gold
  4: { light: '#CFFAFE', base: '#22B8E6', dark: '#0B4F75' }, // platinum
  5: { light: '#F3E8FF', base: '#A855F7', dark: '#4C1384' }, // diamond
  6: { light: '#FFE4D6', base: '#F04438', dark: '#7A1010' }, // immortal
};

/** What players see: the metal tier name, shown with the emblem. */
export const TIER_NAMES: Record<RankTier, string> = {
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
  5: 'Diamond',
  6: 'Immortal',
};

/** Internal level titles, by tier. Tier 6 is "Legend" for XP levels and "Grandmaster" for match points. */
export const PLAYER_RANKS: Record<RankTier, string> = {
  1: 'Rookie',
  2: 'Challenger',
  3: 'Warrior',
  4: 'Master',
  5: 'Champion',
  6: 'Legend',
};

const TITLE_TO_TIER: Record<string, RankTier> = {
  rookie: 1,
  challenger: 2,
  warrior: 3,
  master: 4,
  champion: 5,
  legend: 6,
  grandmaster: 6,
};

export function rankTierFromTitle(title?: string | null): RankTier {
  return TITLE_TO_TIER[(title || '').toLowerCase()] ?? 1;
}

export const tierNameFromTitle = (title?: string | null) => TIER_NAMES[rankTierFromTitle(title)];

export function clampTier(level: number): RankTier {
  return Math.min(6, Math.max(1, Math.round(level))) as RankTier;
}

// ---------- Squad leagues ----------

export interface SquadLeague {
  tier: RankTier;
  name: string;
  minPower: number;
  nextPower: number | null;
}

const LEAGUES: { name: string; minPower: number }[] = [
  { name: 'Bronze League', minPower: 0 },
  { name: 'Silver League', minPower: 300 },
  { name: 'Gold League', minPower: 800 },
  { name: 'Platinum League', minPower: 1600 },
  { name: 'Diamond League', minPower: 3000 },
  { name: 'Legend League', minPower: 5000 },
];

export function squadLeagueFromPower(power: number): SquadLeague {
  let i = 0;
  while (i < LEAGUES.length - 1 && power >= LEAGUES[i + 1].minPower) i++;
  return {
    tier: (i + 1) as RankTier,
    name: LEAGUES[i].name,
    minPower: LEAGUES[i].minPower,
    nextPower: LEAGUES[i + 1]?.minPower ?? null,
  };
}

export const tierColor = (tier: RankTier) => TIER_PALETTES[tier].base;

// ---------- Shared art ----------

const useIds = () => {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  return { metal: `m${raw}`, plate: `p${raw}`, gem: `g${raw}`, flame: `f${raw}` };
};

const Gradients: React.FC<{ ids: ReturnType<typeof useIds>; pal: TierPalette }> = ({ ids, pal }) => (
  <Defs>
    <LinearGradient id={ids.metal} x1="0" y1="0" x2="0.4" y2="1">
      <Stop offset="0" stopColor={pal.light} />
      <Stop offset="0.45" stopColor={pal.base} />
      <Stop offset="1" stopColor={pal.dark} />
    </LinearGradient>
    <LinearGradient id={ids.plate} x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#2B2550" />
      <Stop offset="1" stopColor="#120F26" />
    </LinearGradient>
    <LinearGradient id={ids.gem} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor="#FFFFFF" />
      <Stop offset="0.5" stopColor={pal.light} />
      <Stop offset="1" stopColor={pal.base} />
    </LinearGradient>
    <RadialGradient id={ids.flame} cx="50%" cy="55%" r="50%">
      <Stop offset="0.55" stopColor="#FDBA74" />
      <Stop offset="0.8" stopColor="#F97316" />
      <Stop offset="1" stopColor="#B91C1C" />
    </RadialGradient>
  </Defs>
);

/** Spiky halo behind tier-6 emblems. */
const flameHalo = (cx: number, cy: number, outer: number, inner: number, spikes = 14) =>
  Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const CROWN = 'M34 17 L37 4 L44 11 L50 1 L56 11 L63 4 L66 17 Z';

const Crown: React.FC<{ fill: string }> = ({ fill }) => (
  <G>
    <Path d={CROWN} fill={fill} stroke="#120F26" strokeWidth={1.5} strokeLinejoin="round" />
    <Circle cx={50} cy={3} r={2.2} fill="#FFFFFF" />
    <Circle cx={37} cy={5} r={1.6} fill="#FFFFFF" />
    <Circle cx={63} cy={5} r={1.6} fill="#FFFFFF" />
  </G>
);

const Gem: React.FC<{ fill: string; cy: number; scale?: number }> = ({ fill, cy, scale = 1 }) => {
  const w = 10 * scale;
  const h = 13 * scale;
  return (
    <G>
      <Path d={`M50 ${cy - h} L${50 + w} ${cy - 2} L50 ${cy + h} L${50 - w} ${cy - 2} Z`} fill={fill} stroke="#120F26" strokeWidth={1.4} />
      <Path d={`M${50 - w} ${cy - 2} L${50 + w} ${cy - 2} M50 ${cy - h} L${50 - w * 0.4} ${cy - 2} L50 ${cy + h} L${50 + w * 0.4} ${cy - 2} Z`} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={0.9} />
    </G>
  );
};

// ---------- Player rank emblem (shield) ----------

const SHIELD = 'M50 15 L80 24 L80 51 C80 71 67 85 50 95 C33 85 20 71 20 51 L20 24 Z';
const SHIELD_INNER = 'M50 22 L73 29 L73 51 C73 67 63 78 50 86 C37 78 27 67 27 51 L27 29 Z';

const chevron = (top: number, half = 14, h = 15, t = 6) =>
  `M${50 - half} ${top + h - t} L50 ${top} L${50 + half} ${top + h - t} L${50 + half} ${top + h} L50 ${top + t} L${50 - half} ${top + h} Z`;

const wing = (big: boolean) =>
  big
    ? 'M21 30 L3 26 L9 34 L0 38 L8 44 L1 50 L11 54 L6 61 L21 60 Z'
    : 'M21 34 L8 33 L13 40 L6 45 L14 49 L10 55 L21 56 Z';
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${100 - Number(x)} ${y}`);

export const RankEmblem: React.FC<{ tier: RankTier; size?: number }> = ({ tier, size = 40 }) => {
  const ids = useIds();
  const pal = TIER_PALETTES[tier];
  const metal = `url(#${ids.metal})`;
  const chevrons = tier === 1 ? [48] : tier === 2 ? [40, 55] : tier === 3 ? [33, 46, 59] : [];

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Gradients ids={ids} pal={pal} />
        {tier === 6 && <Polygon points={flameHalo(50, 56, 50, 38)} fill={`url(#${ids.flame})`} />}
        {tier >= 4 && (
          <G>
            <Path d={wing(tier >= 5)} fill={metal} stroke="#120F26" strokeWidth={1.4} strokeLinejoin="round" />
            <Path d={mirror(wing(tier >= 5))} fill={metal} stroke="#120F26" strokeWidth={1.4} strokeLinejoin="round" />
          </G>
        )}
        <Path d={SHIELD} fill={metal} stroke="#120F26" strokeWidth={2} strokeLinejoin="round" />
        <Path d={SHIELD_INNER} fill={`url(#${ids.plate})`} />
        <Path d="M50 22 L73 29 L73 40 C60 36 40 36 27 40 L27 29 Z" fill="rgba(255,255,255,0.07)" />
        {chevrons.map((top) => (
          <Path key={top} d={chevron(top)} fill={metal} stroke="#120F26" strokeWidth={1} strokeLinejoin="round" />
        ))}
        {tier === 3 && (
          <G>
            <Circle cx={27} cy={29} r={3} fill={pal.light} stroke="#120F26" strokeWidth={1} />
            <Circle cx={73} cy={29} r={3} fill={pal.light} stroke="#120F26" strokeWidth={1} />
          </G>
        )}
        {tier >= 4 && <Gem fill={`url(#${ids.gem})`} cy={55} scale={tier >= 5 ? 1.25 : 1.1} />}
        {tier >= 5 && <Crown fill={metal} />}
      </Svg>
    </View>
  );
};

// ---------- Squad league emblem (fortress crest) ----------

const HEX = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i;
  return `${(50 + 38 * Math.cos(a)).toFixed(1)},${(56 + 38 * Math.sin(a)).toFixed(1)}`;
}).join(' ');
const HEX_INNER = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i;
  return `${(50 + 31 * Math.cos(a)).toFixed(1)},${(56 + 31 * Math.sin(a)).toFixed(1)}`;
}).join(' ');

const KEEP =
  'M37 76 L37 54 L40 54 L40 50 L44 50 L44 54 L48 54 L48 50 L52 50 L52 54 L56 54 L56 50 L60 50 L60 54 L63 54 L63 76 L55 76 L55 69 C55 63 45 63 45 69 L45 76 Z';
const TOWER_L = 'M27 76 L27 48 L29 48 L29 45 L32 45 L32 48 L34 48 L34 45 L37 45 L37 76 Z';

/** Leaves along an arc around the crest; the right side mirrors the left. */
const laurel = (side: 1 | -1) =>
  Array.from({ length: 6 }, (_, i) => {
    const deg = 100 + i * 21; // 100deg = bottom-left, upward from there
    const a = (deg * Math.PI) / 180;
    const lx = 50 + 45 * Math.cos(a);
    const y = 58 + 45 * Math.sin(a);
    return {
      key: `${side}${i}`,
      x: side === 1 ? lx : 100 - lx,
      y,
      deg: side === 1 ? deg + 90 : 90 - deg,
    };
  });

export const SquadLeagueEmblem: React.FC<{ tier: RankTier; size?: number }> = ({ tier, size = 40 }) => {
  const ids = useIds();
  const pal = TIER_PALETTES[tier];
  const metal = `url(#${ids.metal})`;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Gradients ids={ids} pal={pal} />
        {tier === 6 && <Polygon points={flameHalo(50, 56, 50, 40, 16)} fill={`url(#${ids.flame})`} />}
        {tier >= 4 &&
          ([1, -1] as const).flatMap((side) =>
            laurel(side).map((l) => (
              <Ellipse
                key={l.key}
                cx={l.x}
                cy={l.y}
                rx={6}
                ry={2.8}
                fill={metal}
                stroke="#120F26"
                strokeWidth={0.8}
                transform={`rotate(${l.deg} ${l.x} ${l.y})`}
              />
            )),
          )}
        <Polygon points={HEX} fill={metal} stroke="#120F26" strokeWidth={2} strokeLinejoin="round" />
        <Polygon points={HEX_INNER} fill={`url(#${ids.plate})`} />
        {tier >= 3 && (
          <G>
            <Path d={TOWER_L} fill={metal} stroke="#120F26" strokeWidth={1} />
            <Path d={mirror(TOWER_L)} fill={metal} stroke="#120F26" strokeWidth={1} />
          </G>
        )}
        <Path d={KEEP} fill={metal} stroke="#120F26" strokeWidth={1.1} strokeLinejoin="round" />
        {tier >= 2 && (
          <G>
            <Path d="M50 50 L50 34" stroke={pal.light} strokeWidth={1.8} />
            <Path d="M50 34 L61 37.5 L50 41 Z" fill={tier >= 4 ? '#F04438' : pal.light} stroke="#120F26" strokeWidth={0.8} />
          </G>
        )}
        {tier >= 5 && <Crown fill={metal} />}
      </Svg>
    </View>
  );
};
