// Game-style building blocks for the Squad screen: gradient fills, hexagon emblems,
// level/power badges and the top-3 podium. Banners use a fixed dark palette in both themes.
import React, { useId } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Image as SvgImage, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Building2 } from 'lucide-react-native';
import { Community } from '../../../utils/communityService';
import { SquadLeagueEmblem, squadLeagueFromPower } from '../../../components/RankEmblem';

export const GAME = {
  night: '#14112B',
  indigo: '#2A2470',
  violet: '#4C2FA8',
  gold: '#FBBF24',
  goldDeep: '#D97706',
  silver: '#CBD5E1',
  bronze: '#D08A4E',
  ember: '#E25822',
  text: '#FFFFFF',
  textSoft: 'rgba(255,255,255,0.72)',
};

export const PODIUM_COLORS = [GAME.gold, GAME.silver, GAME.bronze];

/** Absolute-fill linear gradient (top-left to bottom-right by default). */
export const GradientFill: React.FC<{ colors: string[]; vertical?: boolean; borderRadius?: number }> = ({
  colors,
  vertical,
  borderRadius = 0,
}) => {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2="1">
          {colors.map((c, i) => {
            // react-native-svg ignores alpha in #RRGGBBAA, so pass it as stopOpacity
            const alpha = /^#[0-9a-f]{8}$/i.test(c) ? parseInt(c.slice(7), 16) / 255 : 1;
            return <Stop key={i} offset={`${i / (colors.length - 1)}`} stopColor={c.slice(0, 7)} stopOpacity={alpha} />;
          })}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" rx={borderRadius} fill={`url(#${id})`} />
    </Svg>
  );
};

/** Soft round glow (fades to transparent), for lighting up emblems on dark cards. */
export const GlowSpot: React.FC<{ color: string; size: number; style?: object; strength?: number }> = ({
  color,
  size,
  style,
  strength = 0.45,
}) => {
  const id = `r${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} style={[{ position: 'absolute' }, style]} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
};

const hexPoints = (size: number, inset = 0) => {
  const r = size / 2 - inset;
  const c = size / 2;
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
  }).join(' ');
};

/** Squad logo clipped to a hexagon with a coloured frame. */
export const SquadEmblem: React.FC<{
  logoUrl?: string | null;
  size: number;
  frameColor?: string;
  frameWidth?: number;
}> = ({ logoUrl, size, frameColor = GAME.gold, frameWidth = 3 }) => {
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const inner = hexPoints(size, frameWidth);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <ClipPath id={id}>
            <Polygon points={inner} />
          </ClipPath>
        </Defs>
        <Polygon points={hexPoints(size)} fill={frameColor} />
        <Polygon points={inner} fill="#221D4F" />
        {logoUrl ? (
          <SvgImage
            href={{ uri: logoUrl }}
            x={frameWidth}
            y={frameWidth}
            width={size - frameWidth * 2}
            height={size - frameWidth * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${id})`}
          />
        ) : null}
      </Svg>
      {!logoUrl && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <Building2 size={size * 0.38} color={frameColor} />
        </View>
      )}
    </View>
  );
};

/** Small hexagon showing a level number. */
export const LevelHex: React.FC<{ level: number; size?: number; color?: string }> = ({
  level,
  size = 26,
  color = GAME.gold,
}) => (
  <View style={{ width: size, height: size }}>
    <Svg width={size} height={size}>
      <Polygon points={hexPoints(size)} fill={GAME.night} />
      <Polygon points={hexPoints(size, 2)} fill={color} />
    </Svg>
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Text style={[styles.levelHexText, { fontSize: size * 0.42 }]}>{level}</Text>
    </View>
  </View>
);

export const PowerPill: React.FC<{ power: number; dark?: boolean; compact?: boolean }> = ({ power, dark, compact }) => (
  <View style={[styles.powerPill, dark ? styles.powerPillDark : styles.powerPillLight, compact && styles.powerPillCompact]}>
    <Text style={[styles.powerText, compact && { fontSize: 11.5 }, !dark && { color: GAME.goldDeep }]}>
      {power.toLocaleString()}
    </Text>
    <Text style={[styles.powerUnit, !dark && { color: GAME.goldDeep }]}>PWR</Text>
  </View>
);

/** Squad logo with its league crest pinned to the bottom edge. */
export const SquadCrest: React.FC<{ logoUrl?: string | null; power: number; size: number; frameColor?: string }> = ({
  logoUrl,
  power,
  size,
  frameColor,
}) => {
  const league = squadLeagueFromPower(power);
  const crest = Math.round(size * 0.46);
  return (
    <View style={{ width: size, height: size + crest * 0.35 }}>
      <SquadEmblem logoUrl={logoUrl} size={size} frameColor={frameColor} frameWidth={size >= 70 ? 4 : 3} />
      <View style={[styles.crestPin, { left: (size - crest) / 2, top: size - crest * 0.65 }]}>
        <SquadLeagueEmblem tier={league.tier} size={crest} />
      </View>
    </View>
  );
};

/** Progress bar with a gold fill on a dark track. */
export const GameProgress: React.FC<{ progress: number; height?: number }> = ({ progress, height = 10 }) => (
  <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
    <View
      style={{
        width: `${Math.max(4, Math.min(1, progress) * 100)}%`,
        height: '100%',
        borderRadius: height / 2,
        overflow: 'hidden',
      }}
    >
      <GradientFill colors={[GAME.goldDeep, GAME.gold, '#FDE68A']} />
    </View>
  </View>
);

interface PodiumProps {
  squads: Community[];
  powers: Record<string, number>;
  myCommunityId?: string | null;
  onPress: (c: Community) => void;
}

/** Top 3 squads: 2nd, 1st, 3rd with stepped pedestals. */
export const SquadPodium: React.FC<PodiumProps> = ({ squads, powers, myCommunityId, onPress }) => {
  const order = [1, 0, 2].filter((i) => squads[i]);
  const heights = [96, 70, 52];
  return (
    <View style={styles.podiumWrap}>
      <GradientFill colors={[GAME.indigo, GAME.night]} vertical borderRadius={24} />
      <View style={styles.podiumRow}>
        {order.map((i) => {
          const squad = squads[i];
          const color = PODIUM_COLORS[i];
          const isFirst = i === 0;
          const mine = squad.id === myCommunityId;
          return (
            <TouchableOpacity key={squad.id} style={styles.podiumSlot} activeOpacity={0.85} onPress={() => onPress(squad)}>
              <SquadCrest logoUrl={squad.logo_url} power={powers[squad.id] ?? 0} size={isFirst ? 74 : 58} frameColor={color} />
              <Text style={styles.podiumName} numberOfLines={1}>{squad.name}</Text>
              {mine && <Text style={styles.podiumYou}>YOUR SQUAD</Text>}
              <PowerPill power={powers[squad.id] ?? 0} dark compact />
              <View style={[styles.pedestal, { height: heights[i], borderColor: color }]}>
                <GradientFill colors={[`${color}55`, `${color}10`]} vertical />
                <Text style={[styles.pedestalRank, { color }]}>{i + 1}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  levelHexText: { color: GAME.night, fontWeight: '900' },

  powerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26, borderRadius: 13 },
  powerPillCompact: { height: 22, paddingHorizontal: 7, borderRadius: 11 },
  powerPillDark: { backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' },
  powerPillLight: { backgroundColor: 'rgba(251,191,36,0.14)' },
  powerText: { color: GAME.gold, fontSize: 13, fontWeight: '900' },
  powerUnit: { color: GAME.gold, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, opacity: 0.8 },
  crestPin: { position: 'absolute' },

  progressTrack: { backgroundColor: 'rgba(0,0,0,0.35)', overflow: 'hidden' },

  podiumWrap: { borderRadius: 24, overflow: 'hidden', paddingTop: 18, paddingHorizontal: 12 },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  podiumSlot: { flex: 1, maxWidth: 124, alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  podiumName: { color: GAME.text, fontSize: 12.5, fontWeight: '900', maxWidth: '100%', marginTop: 2 },
  podiumYou: { color: GAME.gold, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8, marginTop: -4 },
  pedestal: {
    alignSelf: 'stretch',
    marginTop: 4,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 8,
  },
  pedestalRank: { fontSize: 26, fontWeight: '900' },
});
