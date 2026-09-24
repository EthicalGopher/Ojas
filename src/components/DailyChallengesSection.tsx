import React, { useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  Check,
  Flame,
  Play,
  Target,
} from 'lucide-react-native';
import { ExerciseIcon } from './ExerciseIcon';
import { ExerciseItem } from '../utils/exerciseService';
import { UserProfile } from '../utils/profileService';
import {
  generateDailyChallenges,
  DailyChallengeSummary,
} from '../utils/dailyChallengeService';
import { useDailyChallengeStore } from '../store/dailyChallengeStore';
import { colors, radius } from '../theme';

interface DailyChallengesSectionProps {
  exercises: ExerciseItem[];
  profile: UserProfile | null;
  selectedDateString?: string;
  onOpenCamera: (exerciseId?: string, exerciseName?: string, isTutor?: boolean) => void;
  onExerciseSelect: (exercise: ExerciseItem) => void;
}

// Exercise cards alternate between the two shared exercise colors.
const CARD_PALETTES = [
  { bg: '#C8B6FF', textColor: '#11141A', subColor: '#374151', badgeBg: 'rgba(17, 20, 26, 0.08)' },
  { bg: '#FFD6E0', textColor: '#11141A', subColor: '#374151', badgeBg: 'rgba(17, 20, 26, 0.08)' },
];

export const DailyChallengesSection: React.FC<DailyChallengesSectionProps> = ({
  exercises,
  profile,
  selectedDateString,
  onOpenCamera,
  onExerciseSelect,
}) => {
  const completedChallengeIds = useDailyChallengeStore((state) => state.completedChallengeIds);
  const exerciseProgressToday = useDailyChallengeStore((state) => state.exerciseProgressToday);

  const summary: DailyChallengeSummary = useMemo(() => {
    return generateDailyChallenges(
      exercises,
      profile,
      selectedDateString,
      completedChallengeIds,
      exerciseProgressToday
    );
  }, [exercises, profile, selectedDateString, completedChallengeIds, exerciseProgressToday]);

  const { challenges, completedCount, totalCount, totalCalories, totalXp } = summary;

  // Calculate total cumulative progress across every recommended exercise
  const totalOverallPct = useMemo(() => {
    if (!challenges || challenges.length === 0) return 0;
    const sumPct = challenges.reduce((sum, c) => {
      const pct = Math.min(100, Math.round((c.currentProgress / c.targetValue) * 100));
      return sum + pct;
    }, 0);
    return Math.min(100, Math.round(sumPct / challenges.length));
  }, [challenges]);

  if (challenges.length === 0) return null;

  const isAllCompleted = completedCount === totalCount && totalCount > 0;

  return (
    <View style={styles.container}>
      {/* 1. SECTION HEADER */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Daily quests</Text>
          <View style={styles.xpRewardPill}>
            <Text style={styles.xpRewardText}>+{totalXp} XP</Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            isAllCompleted ? styles.statusBadgeCompleted : styles.statusBadgeActive,
          ]}
        >
          {isAllCompleted ? (
            <>
              <Check size={11} color="#10B981" strokeWidth={3} style={{ marginRight: 3 }} />
              <Text style={styles.statusBadgeCompletedText}>All Done!</Text>
            </>
          ) : (
            <Text style={styles.statusBadgeText}>
              {completedCount}/{totalCount} Completed
            </Text>
          )}
        </View>
      </View>

      {/* 2. TOTAL LOADING / PROGRESS BAR ACROSS ALL RECOMMENDED EXERCISES */}
      <View style={styles.totalProgressCard}>
        <View style={styles.totalProgressTopRow}>
          <View style={styles.totalProgressLeft}>
            <Text style={styles.totalProgressTitle}>
              {isAllCompleted ? 'Daily Goals Accomplished!' : 'Total Exercises Progress'}
            </Text>
            <Text style={styles.totalProgressSubtitle}>
              {isAllCompleted
                ? 'All therapeutic exercises verified by AI Pose.'
                : `${completedCount} of ${totalCount} exercises finished (${totalOverallPct}% total)`}
            </Text>
          </View>

          <View style={[styles.totalPercentPill, isAllCompleted && styles.totalPercentPillDone]}>
            <Text style={[styles.totalPercentText, isAllCompleted && styles.totalPercentTextDone]}>
              {totalOverallPct}%
            </Text>
          </View>
        </View>

        {/* The Overall Loading Bar */}
        <View style={styles.totalProgressBarTrack}>
          <View
            style={[
              styles.totalProgressBarFill,
              {
                width: isAllCompleted ? '100%' : `${Math.max(totalOverallPct > 0 ? 6 : 0, totalOverallPct)}%`,
                backgroundColor: isAllCompleted ? colors.success : colors.flame,
              },
            ]}
          />
        </View>
      </View>

      {/* 3. HORIZONTAL CAROUSEL OF EXERCISE CHALLENGE CARDS */}
      <FlatList
        data={challenges}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.flatListContent}
        renderItem={({ item, index }) => {
          const isDone = item.isCompleted;
          const palette = CARD_PALETTES[index % CARD_PALETTES.length];

          const targetLabel =
            item.targetType === 'hold_seconds'
              ? `${item.targetValue}s Hold`
              : `${item.targetValue} Reps`;

          const progressPct = Math.min(
            100,
            Math.round((item.currentProgress / item.targetValue) * 100)
          );

          const liveCountText =
            item.targetType === 'hold_seconds'
              ? `${Math.min(item.targetValue, item.currentProgress).toFixed(0)}s / ${item.targetValue}s`
              : `${Math.min(item.targetValue, item.currentProgress)} / ${item.targetValue} reps`;

          const shortTag = item.illnessTitle
            ? item.illnessTitle
            : item.exercise.category === 'flexibility'
            ? 'Mobility'
            : 'Strength';

          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.challengeCard, { backgroundColor: palette.bg }]}
              activeOpacity={0.92}
              onPress={() => onExerciseSelect(item.exercise)}
            >
              {/* Card Top: Short Category Tag & Target Goal Badge */}
              <View style={styles.cardTopRow}>
                <View style={[styles.categoryPill, { backgroundColor: palette.badgeBg }]}>
                  <Text style={[styles.categoryPillText, { color: palette.textColor }]}>
                    {shortTag.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.targetBadge}>
                  <Text style={styles.targetBadgeText}>{targetLabel}</Text>
                </View>
              </View>

              {/* Card Center: Clean Visual Exercise Icon */}
              <View style={styles.iconContainer}>
                <ExerciseIcon
                  imageUrl={item.exercise.image_url}
                  icon={item.exercise.icon || '🧘'}
                  size={54}
                  fontSize={30}
                />
              </View>

              {/* Individual Card Loading / Progress Bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressInfoRow}>
                  <Text style={[styles.progressCountLabel, { color: palette.subColor }]}>
                    {isDone ? '✓ Goal Reached' : liveCountText}
                  </Text>
                  <Text style={[styles.progressPercentLabel, { color: palette.textColor }]}>
                    {isDone ? '100%' : `${progressPct}%`}
                  </Text>
                </View>

                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: isDone ? '100%' : `${Math.max(progressPct > 0 ? 8 : 0, progressPct)}%`,
                        backgroundColor: isDone ? '#059669' : palette.textColor,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Card Bottom: Exercise Name & 1-Tap Play Action */}
              <View style={styles.cardBottomRow}>
                <View style={styles.nameWrap}>
                  <Text style={[styles.exerciseName, { color: palette.textColor }]} numberOfLines={1}>
                    {item.exerciseName}
                  </Text>
                  <Text style={[styles.benefitSub, { color: palette.subColor }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>

                {isDone ? (
                  <View style={styles.doneCircle}>
                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.playBtn}
                    activeOpacity={0.85}
                    onPress={(e) => {
                      e.stopPropagation();
                      onOpenCamera(item.exerciseId, item.exerciseName, false);
                    }}
                  >
                    <Play size={12} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 28 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  xpRewardPill: {
    marginLeft: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  xpRewardText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '900',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  statusBadgeCompleted: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  statusBadgeText: {
    color: colors.textMuted,
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusBadgeCompletedText: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '800',
  },
  totalProgressCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  totalProgressTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  totalProgressLeft: {
    flex: 1,
    marginRight: 10,
  },
  totalProgressTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  totalProgressSubtitle: { color: colors.textMuted, fontSize: 11.5, marginTop: 3, fontWeight: '600' },
  totalPercentPill: { backgroundColor: 'rgba(226, 88, 34, 0.14)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  totalPercentPillDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  totalPercentText: { color: colors.flame, fontSize: 13, fontWeight: '900' },
  totalPercentTextDone: {
    color: '#10B981',
  },
  totalProgressBarTrack: { height: 9, width: '100%', backgroundColor: colors.surfaceHi, borderRadius: 5, overflow: 'hidden' },
  totalProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  flatListContent: { gap: 14 },
  challengeCard: {
    width: 215,
    borderRadius: 22,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 195,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryPill: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  categoryPillText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  targetBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  targetBadgeText: {
    color: '#11141A',
    fontSize: 10,
    fontWeight: '900',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  progressSection: {
    marginBottom: 8,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressCountLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  progressPercentLabel: {
    fontSize: 10,
    fontWeight: '900',
  },
  progressBarTrack: {
    height: 5,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  nameWrap: {
    flex: 1,
    marginRight: 8,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  benefitSub: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  doneCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
