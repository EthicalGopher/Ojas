// Profile: only two medals, the current rank (exercise picked in the lobby) and the best rank.
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GText } from '../../components/game';
import { PLAYER_RANKS, RankEmblem, TIER_PALETTES } from '../../components/RankEmblem';
import { LAST_PLAY_KEY, parseLastPlay } from '../../screens/lobbyLogic';
import { useExerciseListStore } from '../../store/exerciseListStore';
import { useColors } from '../../theme';
import { ExerciseRank, useExerciseRanks } from './useExerciseRanks';

export const ProfileRanksCard: React.FC<{ userId: string | undefined; style?: object }> = ({ userId, style }) => {
  const c = useColors();
  const exercises = useExerciseListStore((s) => s.exercises);
  const ids = useMemo(() => exercises.map((e) => e.id), [exercises]);
  const { rankOf, best } = useExerciseRanks(userId, ids);
  const [currentId, setCurrentId] = useState('1');

  useEffect(() => {
    AsyncStorage.getItem(LAST_PLAY_KEY)
      .then((raw) => setCurrentId(parseLastPlay(raw, ids).exerciseId))
      .catch(() => {});
  }, [ids]);

  if (!exercises.length) return null;
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? '';
  const current = rankOf(currentId);

  return (
    <View style={[styles.card, { backgroundColor: c.raised, borderColor: c.edge }, style]}>
      <View style={styles.titleRow}>
        <View style={[styles.accent, { backgroundColor: c.accentFrom }]} />
        <GText variant="title" size={18}>Ranks</GText>
      </View>
      <View style={styles.tiles}>
        <Tile label="Current" rank={current} exercise={nameOf(current.exerciseId)} />
        <Tile label="Best" rank={best ?? current} exercise={nameOf((best ?? current).exerciseId)} />
      </View>
    </View>
  );
};

const Tile: React.FC<{ label: string; rank: ExerciseRank; exercise: string }> = ({ label, rank, exercise }) => {
  const c = useColors();
  const pal = TIER_PALETTES[rank.tier];
  return (
    <View style={[styles.tile, { backgroundColor: c.surfaceHi, borderColor: pal.base }]} accessibilityLabel={`${label} rank: ${PLAYER_RANKS[rank.tier]}, ${exercise}`}>
      <GText variant="caption" tone="muted" style={styles.tileLabel}>{label.toUpperCase()}</GText>
      <RankEmblem tier={rank.tier} size={92} shine />
      <GText variant="title" size={17} style={{ color: pal.base }}>{PLAYER_RANKS[rank.tier]}</GText>
      <GText variant="caption" tone="muted" numberOfLines={1}>{exercise} · {rank.points} pts</GText>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 22, marginBottom: 14, borderWidth: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  accent: { width: 4, height: 18, borderRadius: 2 },
  tiles: { flexDirection: 'row', gap: 12, marginTop: 14 },
  tile: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18, borderWidth: 1.5 },
  tileLabel: { letterSpacing: 2, marginBottom: 4 },
});
