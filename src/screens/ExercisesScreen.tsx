import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronRight, Dumbbell, Flame, Play, Sparkles, Swords, Zap } from 'lucide-react-native';
import { Header } from '../components/Header';
import { ExerciseIcon } from '../components/ExerciseIcon';
import {
  DEFAULT_EXERCISES,
  fetchExercisesFromSupabase,
  ExerciseItem,
} from '../utils/exerciseService';

export type { ExerciseItem };

interface ExercisesScreenProps {
  exercises?: ExerciseItem[];
  queueCounts: Record<string, number>;
  selectedCategory: ExerciseItem['category'];
  onCategoryChange: (category: ExerciseItem['category']) => void;
  onExerciseSelect: (exercise: ExerciseItem) => void;
  onRefreshExercises?: () => Promise<void>;
}

export const ExercisesScreen: React.FC<ExercisesScreenProps> = ({
  exercises: propExercises,
  queueCounts,
  selectedCategory,
  onCategoryChange,
  onExerciseSelect,
  onRefreshExercises,
}) => {
  const [exercisesList, setExercisesList] = useState<ExerciseItem[]>(
    propExercises || DEFAULT_EXERCISES
  );
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (propExercises && propExercises.length > 0) {
      setExercisesList(propExercises);
    } else {
      loadExercises();
    }
  }, [propExercises]);

  const loadExercises = async () => {
    setIsLoading(true);
    try {
      const data = await fetchExercisesFromSupabase();
      if (data && data.length > 0) {
        setExercisesList(data);
      }
    } catch (e) {
      console.warn('Error fetching exercises in ExercisesScreen:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefreshExercises) {
        await onRefreshExercises();
      } else {
        await loadExercises();
      }
    } finally {
      setRefreshing(false);
    }
  };

  const filteredExercises = exercisesList.filter((item) => {
    if (selectedCategory === 'all') return true;
    return item.category === selectedCategory;
  });

  return (
    <View style={styles.exercisesScreenContainer}>
      <Header />

      <ScrollView
        style={styles.mainScrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#E8D5C4"
            colors={['#E8D5C4', '#C8B6FF']}
          />
        }
      >
        {/* Section Title: "Your plan" */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitleText}>Your plan</Text>
      
        </View>

        {/* Dynamic Category Pills Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScrollContent}
        >
          {[
            { id: 'all', label: 'All workouts' },
            { id: 'strength', label: 'Strength' },
            { id: 'cardio', label: 'Cardio' },
            { id: 'flexibility', label: 'Mobility' },
          ].map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                activeOpacity={0.8}
                onPress={() => onCategoryChange(cat.id as any)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && styles.categoryChipTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Loading Indicator */}
        {isLoading && exercisesList.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#E8D5C4" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : filteredExercises.length === 0 ? (
          <View style={styles.emptyBox}>
            <Dumbbell size={36} color="#8E95A0" style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No workouts in this category</Text>
            <Text style={styles.emptySubtitle}>Try selecting 'All workouts' to see everything.</Text>
          </View>
        ) : (
          /* 100% DYNAMIC WORKOUT PLAN CARDS FETCHED FROM SUPABASE */
          filteredExercises.map((exercise, index) => {
            const defaultPalettes = ['#C8B6FF', '#FFD6E0', '#E25822', '#354394', '#FFD6E0'];
            const cardBg = exercise.bg_theme || defaultPalettes[index % defaultPalettes.length];
            const count = queueCounts[exercise.id] || 0;
            const duration = exercise.duration_mins || (index % 2 === 0 ? 32 : 25);
            const muscles = exercise.muscle_groups || (exercise.category === 'strength' ? 'Glutes / Squats / Core' : 'Cardio • Pace & Form');

            return (
              <TouchableOpacity
                key={exercise.id}
                style={[styles.workoutPlanCard, { backgroundColor: cardBg }]}
                activeOpacity={0.9}
                onPress={() => onExerciseSelect(exercise)}
              >
                {/* Top Row: Title & White Duration Badge */}
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardWorkoutTitle} numberOfLines={1}>
                    {exercise.name}
                  </Text>
                  <View style={styles.durationBadge}>
                    <Text style={styles.durationBadgeNumber}>{duration}</Text>
                    <Text style={styles.durationBadgeUnit}>Mins</Text>
                  </View>
                </View>

                {/* Center Body with Athletic Visual & Category Tags */}
                <View style={styles.cardBodyRow}>
                  <View style={styles.athleteVisualCircle}>
                    <ExerciseIcon
                      imageUrl={exercise.image_url}
                      icon={exercise.icon}
                      size={52}
                      fontSize={30}
                    />
                  </View>

                  <View style={styles.cardTagsWrapper}>
                    <View style={styles.muscleTagPill}>
                      <View style={styles.darkDot} />
                      <Text style={styles.muscleTagPillText} numberOfLines={1}>
                        {muscles}
                      </Text>
                    </View>

                    <View style={styles.activePlayersPill}>
                      <Flame size={12} color="#11141A" style={{ marginRight: 3 }} />
                      <Text style={styles.activePlayersText} numberOfLines={1}>
                        {exercise.type || (exercise.category === 'flexibility' ? 'Yoga' : 'Common exercises')}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Bottom Quick Play Strip */}
                <View style={styles.cardBottomRow}>
                  <View style={styles.aiTagPill}>
                    <Text style={styles.aiTagText}>
                      {exercise.description || 'Live Pose & Rep Tracking'}
                    </Text>
                  </View>

                  <View style={styles.playArrowCircle}>
                    <Play size={12} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  exercisesScreenContainer: {
    flex: 1,
    backgroundColor: '#1A1C20',
  },
  mainScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 110,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  refreshHintText: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '800',
  },
  categoryScrollContent: {
    gap: 8,
    marginBottom: 18,
  },
  categoryChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryChipActive: {
    backgroundColor: '#FFFFFF',
  },
  categoryChipText: {
    color: '#8E95A0',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#11141A',
    fontWeight: '900',
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    backgroundColor: '#161B22',
    borderRadius: 24,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: '#8E95A0',
    fontSize: 12,
    marginTop: 4,
  },
  workoutPlanCard: {
    borderRadius: 28,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardWorkoutTitle: {
    color: '#11141A',
    fontSize: 18,
    fontWeight: '900',
    flex: 1,
    marginRight: 10,
  },
  durationBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  durationBadgeNumber: {
    color: '#11141A',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  durationBadgeUnit: {
    color: '#4B5563',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  athleteVisualCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  athleteEmoji: {
    fontSize: 32,
  },
  cardTagsWrapper: {
    flex: 1,
    marginLeft: 14,
    gap: 6,
  },
  muscleTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  darkDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#11141A',
    marginRight: 6,
  },
  muscleTagPillText: {
    color: '#11141A',
    fontSize: 11,
    fontWeight: '700',
  },
  activePlayersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  activePlayersText: {
    color: '#11141A',
    fontSize: 11,
    fontWeight: '800',
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 20, 26, 0.08)',
  },
  aiTagPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  aiTagText: {
    color: '#374151',
    fontSize: 11,
    fontWeight: '700',
  },
  playArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
