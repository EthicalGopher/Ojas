// Train: a game "stage select". Exercise cards in a horizontal row, the selected one's details and
// play buttons on the right (landscape game UI requested by the user, 2026-11-02).
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bot, Clock, Dumbbell, GraduationCap, Info, Star, Swords, Users } from 'lucide-react-native';
import { GameTopBar, GText, Panel, ScreenBackground } from '../components/game';
import { GradientFill } from '../components/game/Gradient';
import { Slant } from '../components/game/Slant';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { juice } from '../juice/juice';
import { softShadow, useColors, type Palette } from '../theme';
import { DEFAULT_EXERCISES, fetchExercisesFromSupabase, ExerciseItem } from '../utils/exerciseService';
import { TourTarget } from '../features/tour/TourTarget';
import { modeSupportsExercise } from './lobbyLogic';

export type { ExerciseItem };

/** What the player picked on the Train screen. */
export type TrainAction = 'tutor' | 'solo' | 'ranked' | 'ai' | 'details';

interface ExercisesScreenProps {
  exercises?: ExerciseItem[];
  queueCounts: Record<string, number>;
  selectedCategory: ExerciseItem['category'];
  onCategoryChange: (category: ExerciseItem['category']) => void;
  onExerciseSelect: (exercise: ExerciseItem) => void;
  onAction: (action: TrainAction, exercise: ExerciseItem) => void;
  onBack: () => void;
  onRefreshExercises?: () => Promise<void>;
}

const CATEGORIES: { id: ExerciseItem['category']; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'strength', label: 'Strength' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'flexibility', label: 'Mobility' },
];

/** Card colours per category (white text stays at least 3:1 on the lighter stop). */
const CARD_COLORS: Record<string, [string, string, string]> = {
  strength: ['#E8452A', '#9E1F14', 'STRENGTH'],
  cardio: ['#2477E0', '#173E9E', 'CARDIO'],
  flexibility: ['#8A4FE0', '#4A2399', 'MOBILITY'],
};

export function difficultyStars(difficulty?: string): number {
  const d = (difficulty || '').toLowerCase();
  if (d.startsWith('adv') || d.startsWith('hard') || d.startsWith('expert')) return 3;
  if (d.startsWith('inter') || d.startsWith('med')) return 2;
  return 1;
}

export const ExercisesScreen: React.FC<ExercisesScreenProps> = ({
  exercises: propExercises,
  queueCounts,
  selectedCategory,
  onCategoryChange,
  onExerciseSelect,
  onAction,
  onBack,
}) => {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<ExerciseItem[]>(propExercises?.length ? propExercises : DEFAULT_EXERCISES);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (propExercises && propExercises.length > 0) {
      setList(propExercises);
      return;
    }
    setLoading(true);
    fetchExercisesFromSupabase()
      .then((data) => data?.length && setList(data))
      .catch((e) => console.warn('Error fetching exercises in ExercisesScreen:', e))
      .finally(() => setLoading(false));
  }, [propExercises]);

  const filtered = useMemo(
    () => list.filter((e) => selectedCategory === 'all' || e.category === selectedCategory),
    [list, selectedCategory]
  );
  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0];
  const left = Math.max(insets.left, 12);
  const right = Math.max(insets.right, 12);

  return (
    <View style={styles.root}>
      <ScreenBackground style={StyleSheet.absoluteFill} />
      <GameTopBar title="Train" onBack={onBack} />

      {/* Category tabs */}
      <View style={[styles.tabs, { paddingLeft: left }]}>
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat.id;
          return (
            <Pressable
              key={cat.id}
              onPress={() => {
                juice.play('toggle');
                onCategoryChange(cat.id);
                setSelectedId(null);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={styles.tab}
            >
              <Slant fill={active ? c.text : c.raised} stroke={active ? undefined : c.edge} />
              <GText variant="label" size={13} style={{ color: active ? c.raised : c.text }}>
                {cat.label.toUpperCase()}
              </GText>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.body, { paddingRight: right }]}>
        {/* Stage cards */}
        {loading && list.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={c.accent} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Dumbbell size={36} color={c.textMuted} />
            <GText variant="title" style={{ marginTop: 8 }}>Nothing here yet</GText>
          </View>
        ) : (
          <FlatList
            horizontal
            data={filtered}
            keyExtractor={(e) => e.id}
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingLeft: left, paddingRight: 12, paddingVertical: 10, gap: 12 }}
            renderItem={({ item, index }) => {
              const card = (
                <StageCard
                  exercise={item}
                  selected={item.id === selected?.id}
                  online={queueCounts[item.id] || 0}
                  onPress={() => {
                    juice.play('tap');
                    setSelectedId(item.id);
                  }}
                  c={c}
                />
              );
              return index === 0 ? <TourTarget id="train-first-exercise">{card}</TourTarget> : card;
            }}
          />
        )}

        {/* Selected stage */}
        {selected && <StagePanel exercise={selected} online={queueCounts[selected.id] || 0} onAction={onAction} onDetails={() => onExerciseSelect(selected)} c={c} />}
      </View>
    </View>
  );
};

const StageCard: React.FC<{ exercise: ExerciseItem; selected: boolean; online: number; onPress: () => void; c: Palette }> = ({ exercise, selected, online, onPress, c }) => {
  const [from, to, tag] = CARD_COLORS[exercise.category] ?? CARD_COLORS.strength;
  const stars = difficultyStars(exercise.difficulty);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${exercise.name}, ${tag.toLowerCase()}, difficulty ${stars} of 3`}
      style={[
        styles.card,
        { borderColor: selected ? c.win : 'rgba(255,255,255,0.35)', borderWidth: selected ? 3 : 1.5 },
        selected ? { boxShadow: `0 0 0 3px ${c.accentFrom}, 0 10px 22px ${c.shadowTint}`, transform: [{ translateY: -6 }] } : softShadow(c),
      ]}
    >
      <GradientFill from={from} to={to} direction="vertical" radius={18} />
      {/* light streaks: arena backdrop */}
      <View style={[styles.streak, { left: -30 }]} />
      <View style={[styles.streak, { left: 60, opacity: 0.06 }]} />

      <View style={styles.cardTop}>
        <View style={styles.tag}>
          <GText variant="label" size={10} style={{ color: '#FFFFFF' }}>{tag}</GText>
        </View>
        {online > 0 && (
          <View style={styles.tag}>
            <Users size={10} color="#FFFFFF" />
            <GText variant="label" size={10} style={{ color: '#FFFFFF' }}>{online}</GText>
          </View>
        )}
      </View>

      <View style={styles.portrait}>
        <View style={styles.spot} />
        <ExerciseIcon imageUrl={exercise.image_url} icon={exercise.icon} size={92} fontSize={50} />
      </View>

      <View style={styles.nameStrip}>
        <GText variant="display" size={19} numberOfLines={1} adjustsFontSizeToFit style={styles.cardName}>
          {exercise.name}
        </GText>
        <View style={styles.stars}>
          {[1, 2, 3].map((n) => (
            <Star key={n} size={13} color={n <= stars ? '#FFC93C' : 'rgba(255,255,255,0.35)'} fill={n <= stars ? '#FFC93C' : 'transparent'} />
          ))}
        </View>
      </View>
    </Pressable>
  );
};

const StagePanel: React.FC<{
  exercise: ExerciseItem;
  online: number;
  onAction: (action: TrainAction, exercise: ExerciseItem) => void;
  onDetails: () => void;
  c: Palette;
}> = ({ exercise, online, onAction, onDetails, c }) => {
  const stars = difficultyStars(exercise.difficulty);
  const aiOk = modeSupportsExercise('ai_duel', exercise.id);
  const mins = exercise.duration_mins || 20;
  const short = useWindowDimensions().height < 400;
  return (
    <Panel tone="raised" radius={20} padding={short ? 10 : 14} style={styles.panel}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <View style={styles.panelHead}>
          <GText variant="display" size={short ? 20 : 24} numberOfLines={1} style={{ flex: 1 }}>{exercise.name}</GText>
          <Pressable onPress={onDetails} hitSlop={8} accessibilityRole="button" accessibilityLabel="More modes and details">
            <Info size={20} color={c.textMuted} />
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.stars}>
            {[1, 2, 3].map((n) => (
              <Star key={n} size={14} color={n <= stars ? c.winInk : c.borderStrong} fill={n <= stars ? c.win : 'transparent'} />
            ))}
          </View>
          <Clock size={13} color={c.textMuted} />
          <GText variant="label" tone="muted">{mins} min</GText>
          {online > 0 && (
            <>
              <Users size={13} color={c.success} />
              <GText variant="label" tone="muted">{online} in queue</GText>
            </>
          )}
        </View>
        {!!exercise.muscle_groups && !short && (
          <GText variant="caption" tone="muted" numberOfLines={1}>{exercise.muscle_groups}</GText>
        )}

        <View style={styles.modeGrid}>
          <ModeTile icon={GraduationCap} label="AI Tutor" sub="Form coaching" compact={short} onPress={() => onAction('tutor', exercise)} c={c} />
          <ModeTile icon={Dumbbell} label="Solo" sub="Free reps" compact={short} onPress={() => onAction('solo', exercise)} c={c} />
          {aiOk && <ModeTile icon={Bot} label="Vs AI" sub="Beat the bot" compact={short} onPress={() => onAction('ai', exercise)} c={c} />}
        </View>
      </ScrollView>

      {/* Main action: ranked duel */}
      <Pressable
        onPress={() => {
          juice.play('ready');
          onAction('ranked', exercise);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Ranked duel, ${exercise.name}`}
        style={({ pressed }) => [styles.battle, short && { height: 48, marginTop: 6 }, pressed && { transform: [{ translateY: 2 }] }]}
      >
        <Slant fill={c.accentLip} offsetY={4} />
        <View style={[styles.battleFace, short && { height: 44 }]}>
          <Slant fill={c.accentFrom} to={c.accentTo} />
          <Swords size={22} color={c.onGradient} />
          <GText variant="hero" size={26} tone="onGradient" numberOfLines={1}>Battle</GText>
        </View>
      </Pressable>
    </Panel>
  );
};

const ModeTile: React.FC<{ icon: React.ComponentType<{ size?: number; color?: string }>; label: string; sub: string; compact?: boolean; onPress: () => void; c: Palette }> = ({
  icon: Icon,
  label,
  sub,
  compact,
  onPress,
  c,
}) => (
  <Pressable
    onPress={() => {
      juice.play('tap');
      onPress();
    }}
    accessibilityRole="button"
    accessibilityLabel={`${label}: ${sub}`}
    style={({ pressed }) => [styles.modeTile, compact && { paddingVertical: 6, gap: 2 }, { backgroundColor: c.surfaceHi, borderColor: c.edge }, pressed && { transform: [{ scale: 0.96 }] }]}
  >
    <Icon size={compact ? 18 : 22} color={c.accent} />
    <GText variant="bodyStrong" size={compact ? 12 : 13} numberOfLines={1}>{label}</GText>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tab: { height: 30, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row', paddingBottom: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { width: 150, flex: 1, borderRadius: 18, overflow: 'hidden', marginTop: 6 },
  streak: { position: 'absolute', top: -40, bottom: -40, width: 40, backgroundColor: '#FFFFFF', opacity: 0.1, transform: [{ rotate: '18deg' }] },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', padding: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)' },
  portrait: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  spot: { position: 'absolute', width: 104, height: 104, borderRadius: 52, backgroundColor: 'rgba(255,255,255,0.9)' },
  nameStrip: { backgroundColor: 'rgba(0,0,0,0.28)', paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  cardName: { color: '#FFFFFF' },
  stars: { flexDirection: 'row', gap: 2 },
  panel: { width: '34%', marginTop: 6, justifyContent: 'space-between' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  modeGrid: { flexDirection: 'row', gap: 8, marginTop: 2, width: '100%' },
  modeTile: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1 },
  battle: { height: 56, marginTop: 10 },
  battleFace: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
