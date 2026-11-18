// Ranked page (MLBB-style): opened from the lobby's rank medal. One rank per exercise; the
// player flips between them here, and the one picked becomes the exercise of the play button.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GText, Panel } from '../../components/game';
import { Slant } from '../../components/game/Slant';
import { PLAYER_RANKS, RankEmblem, RankTier, TIER_NAMES, TIER_PALETTES } from '../../components/RankEmblem';
import { useColors } from '../../theme';
import type { ExerciseItem } from '../../utils/exerciseService';
import { AchievementBadge } from '../../components/AchievementBadge';
import type { Achievement } from './useAchievements';
import type { ExerciseRank } from './useExerciseRanks';

export interface RankScreenProps {
  visible: boolean;
  exercises: ExerciseItem[];
  exerciseId: string;
  rankOf: (exerciseId: string) => ExerciseRank;
  best: ExerciseRank | null;
  achievements: Achievement[];
  startLabel: string;
  onSelect: (exerciseId: string) => void;
  onStart: () => void;
  onClose: () => void;
}

const STARS = 5;

export const RankScreen: React.FC<RankScreenProps> = ({ visible, exercises, exerciseId, rankOf, best, achievements, startLabel, onSelect, onStart, onClose }) => {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const index = Math.max(0, exercises.findIndex((e) => e.id === exerciseId));
  const exercise = exercises[index];
  if (!exercise) return null;

  const rank = rankOf(exercise.id);
  const pal = TIER_PALETTES[rank.tier];
  const top = rank.tier === 6;
  const stars = top ? STARS : Math.min(STARS, Math.floor(rank.level.progressPercent / (100 / STARS)));
  const winRate = rank.played > 0 ? `${Math.round((rank.won / rank.played) * 100)}%` : '–';
  const medal = Math.min(height * 0.46, 230);
  const short = height < 400;
  const step = (dir: 1 | -1) => onSelect(exercises[(index + dir + exercises.length) % exercises.length].id);
  const sideL = Math.max(insets.left, 16);
  const sideR = Math.max(insets.right, 16);
  const bottom = Math.max(insets.bottom, 10);

  return (
    <Modal visible={visible} animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: '#0B1220' }]}>
        {/* tier-coloured light behind the medal */}
        <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
          <Defs>
            <RadialGradient id="rankGlow" cx="50%" cy="42%" r="55%">
              <Stop offset="0" stopColor={pal.base} stopOpacity={0.45} />
              <Stop offset="0.55" stopColor={pal.dark} stopOpacity={0.25} />
              <Stop offset="1" stopColor="#0B1220" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#rankGlow)" />
        </Svg>

        {/* top-left: back + title */}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to lobby" style={[styles.back, { left: sideL, top: Math.max(insets.top, 12) }]} hitSlop={10}>
          <ChevronLeft size={30} color="#FFFFFF" />
          <View>
            <GText variant="title" size={22} style={{ color: '#FFFFFF' }}>Ranked</GText>
            <GText variant="caption" tone="muted">One rank for every exercise</GText>
          </View>
        </Pressable>

        {/* left: every exercise rank, tap to switch */}
        <ScrollView
          style={[styles.list, { left: sideL, top: (short ? 64 : 84) + Math.max(insets.top, 0), bottom: bottom + (short ? 60 : 74) }]}
          contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {exercises.map((ex) => {
            const r = rankOf(ex.id);
            const on = ex.id === exercise.id;
            return (
              <Pressable
                key={ex.id}
                onPress={() => onSelect(ex.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${ex.name}, ${PLAYER_RANKS[r.tier]}`}
                style={[styles.row, { borderColor: on ? TIER_PALETTES[r.tier].base : 'rgba(255,255,255,0.08)', backgroundColor: on ? 'rgba(255,255,255,0.12)' : 'rgba(10,16,30,0.72)' }]}
              >
                <RankEmblem tier={r.tier} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <GText variant="label" numberOfLines={1} style={{ color: '#FFFFFF' }}>{ex.name}</GText>
                  <GText variant="caption" numberOfLines={1} style={{ color: TIER_PALETTES[r.tier].light }}>
                    {PLAYER_RANKS[r.tier]} · {r.points} pts
                  </GText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* centre: rank name, medal, stars */}
        <View style={[styles.center, { top: Math.max(insets.top, 8) + 4, bottom: bottom + (short ? 64 : 80) }]} pointerEvents="box-none">
          <GText variant="display" size={short ? 26 : 32} style={{ color: pal.light }}>{PLAYER_RANKS[rank.tier]}</GText>
          <View style={styles.medalRow}>
            <Arrow dir={-1} onPress={() => step(-1)} />
            <RankEmblem key={exercise.id} tier={rank.tier} size={medal} shine />
            <Arrow dir={1} onPress={() => step(1)} />
          </View>
          <View style={styles.stars} accessibilityLabel={`${stars} of ${STARS} stars`}>
            {Array.from({ length: STARS }, (_, i) => (
              <Star key={i} size={short ? 22 : 28} color={i < stars ? '#FACC15' : 'rgba(255,255,255,0.25)'} fill={i < stars ? '#FACC15' : 'rgba(0,0,0,0.35)'} />
            ))}
          </View>
          <GText variant="caption" style={{ color: 'rgba(255,255,255,0.8)', marginTop: 4, textAlign: 'center', maxWidth: 420 }}>
            {exercise.name} · {TIER_NAMES[rank.tier]} ·{' '}
            {top ? 'Top rank reached' : `${rank.level.pointsToNext} pts to ${PLAYER_RANKS[(rank.tier + 1) as RankTier]}`}
          </GText>
        </View>

        {/* top-right: achievements */}
        <Achievements list={achievements} short={short} style={{ right: sideR, top: Math.max(insets.top, 12) }} />

        {/* bottom-right: stats + best rank */}
        <Panel tone="raised" radius={18} padding={10} style={[styles.stats, { right: sideR, bottom: bottom + (short ? 64 : 80) }]}>
          <Stat value={winRate} label="Win rate" />
          <Stat value={String(rank.played)} label="Matches" />
          <View style={styles.stat}>
            {best ? <RankEmblem tier={best.tier} size={40} /> : <View style={{ height: 40 }} />}
            <GText variant="caption" tone="muted">Best rank</GText>
          </View>
        </Panel>

        {/* bottom centre: start */}
        <Pressable
          onPress={onStart}
          accessibilityRole="button"
          accessibilityLabel={`${startLabel}: ${exercise.name}`}
          style={({ pressed }) => [styles.start, { bottom, height: short ? 52 : 62, width: Math.min(340, width * 0.32) }, pressed && { transform: [{ translateY: 2 }] }]}
        >
          <Slant fill={c.accentLip} offsetY={4} />
          <View style={styles.startFace}>
            <Slant fill={c.accentFrom} to={c.accentTo} />
            <GText variant="hero" size={short ? 24 : 28} tone="onGradient" numberOfLines={1} adjustsFontSizeToFit>
              {startLabel}
            </GText>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
};

const Arrow: React.FC<{ dir: 1 | -1; onPress: () => void }> = ({ dir, onPress }) => {
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={dir === 1 ? 'Next exercise rank' : 'Previous exercise rank'} style={styles.arrow}>
      <Icon size={30} color="#FFFFFF" />
    </Pressable>
  );
};

const Achievements: React.FC<{ list: Achievement[]; short: boolean; style: object }> = ({ list, short, style }) => {
  const done = list.filter((a) => a.have >= a.need).length;
  const size = short ? 36 : 44;
  return (
    <Panel tone="raised" radius={18} padding={10} style={[styles.ach, style]}>
      <View style={styles.achHead}>
        <GText variant="label" style={{ color: '#FFFFFF' }}>Achievements</GText>
        <GText variant="caption" tone="muted">{done}/{list.length}</GText>
      </View>
      <View style={styles.achGrid}>
        {list.map((a) => {
          const on = a.have >= a.need;
          return (
            <View key={a.key} style={styles.achItem} accessibilityLabel={`${a.title}, ${on ? 'earned' : `${Math.min(a.have, a.need)} of ${a.need} ${a.unit}`}`}>
              <AchievementBadge metal={a.metal} mark={a.mark} unlocked={on} size={size} />
              <GText variant="caption" numberOfLines={1} style={{ color: on ? '#FFFFFF' : 'rgba(255,255,255,0.55)', fontSize: 10 }}>{a.title}</GText>
              <GText variant="caption" numberOfLines={1} style={{ color: on ? '#4ADE80' : 'rgba(255,255,255,0.4)', fontSize: 9 }}>
                {on ? 'EARNED' : `${Math.min(a.have, a.need).toLocaleString()}/${a.need.toLocaleString()}`}
              </GText>
            </View>
          );
        })}
      </View>
    </Panel>
  );
};

const Stat: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.stat}>
    <GText variant="number" size={24} style={{ color: '#FFFFFF', height: 40, textAlignVertical: 'center' }}>{value}</GText>
    <GText variant="caption" tone="muted">{label}</GText>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 2 },
  list: { position: 'absolute', width: 210 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5 },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  medalRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  stars: { flexDirection: 'row', gap: 6, marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)' },
  ach: { position: 'absolute', width: 210 },
  achHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 },
  achItem: { width: '33.33%', alignItems: 'center' },
  stats: { position: 'absolute', flexDirection: 'row', gap: 16 },
  stat: { alignItems: 'center', minWidth: 64 },
  start: { position: 'absolute', alignSelf: 'center' },
  startFace: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
