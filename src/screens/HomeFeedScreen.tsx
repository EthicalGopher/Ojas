import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  HelpCircle,
  Info,
  Lightbulb,
  Play,
  Plus,
  Settings,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Swords,
  Trophy,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { useUserStore } from '../store/userStore';
import { fetchFriends, FriendshipItem } from '../utils/friendService';

export interface ExerciseItem {
  id: string;
  name: string;
  category: 'all' | 'strength' | 'cardio' | 'flexibility';
  icon: string;
  isFavorite?: boolean;
  bgGradient?: string;
  description?: string;
  image_url?: string;
  type?: string;
}

interface HomeFeedScreenProps {
  onlineCount: number;
  selectedModel: 'light' | 'medium' | 'high';
  onExerciseSelect: (exercise: ExerciseItem) => void;
  onSettingsPress: () => void;
  onOpenCamera: (exerciseId?: string, exerciseName?: string) => void;
  onNavigateToTab?: (tab: 'profile' | 'workouts') => void;
  featuredExercise?: ExerciseItem;
}

interface TutorialModalData {
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  steps: { title: string; desc: string }[];
}

export const HomeFeedScreen: React.FC<HomeFeedScreenProps> = ({
  onlineCount,
  selectedModel,
  onExerciseSelect,
  onSettingsPress,
  onOpenCamera,
  onNavigateToTab,
  featuredExercise,
}) => {
  const { user } = useUserStore();
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(false);
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialModalData | null>(null);

  const activeExercise: ExerciseItem = featuredExercise || {
    id: '1',
    name: 'Squats',
    category: 'strength',
    icon: '🏋️',
    isFavorite: true,
    description: 'AI Real-time MediaPipe Pose Tracker for Parallel Depth & Rep Counting',
  };

  // Dynamic Current Date & Week Days Generation
  const { currentMonthYear, currentWeekDays, todayDateNumber } = useMemo(() => {
    const today = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthYear = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;
    const todayDateNumber = today.getDate();

    // Find the Monday of current week
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const dayInitials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const currentWeekDays = dayInitials.map((initial, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        day: initial,
        date: d.getDate(),
        fullDate: d,
        isToday: d.toDateString() === today.toDateString(),
      };
    });

    return { currentMonthYear, currentWeekDays, todayDateNumber };
  }, []);

  const [selectedDay, setSelectedDay] = useState<number>(todayDateNumber);

  const loadFriendsList = useCallback(async () => {
    if (!user?.id) return;
    setLoadingFriends(true);
    try {
      const list = await fetchFriends(user.id);
      setFriends(list);
    } catch (e) {
      console.warn('Failed to load friends on home feed:', e);
    } finally {
      setLoadingFriends(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFriendsList();
  }, [loadFriendsList]);

  // Dynamic Tutorial Data
  const TUTORIALS: TutorialModalData[] = [
    {
      title: 'How AI Pose Tracking Works',
      subtitle: 'Real-time 33-point MediaPipe joint angle tracking for squats parallel depth.',
      badge: 'AI TECHNOLOGY 👁️',
      icon: '🧠',
      steps: [
        {
          title: '1. Joint Detection',
          desc: 'MediaPipe AI tracks your shoulders, hips, knees, and ankles at high FPS.',
        },
        {
          title: '2. Knee Angle Validation',
          desc: 'When your hip crease drops below your knee top (< 90° angle), depth is verified.',
        },
        {
          title: '3. Full Lockout Counting',
          desc: 'Returning to upright position registers a complete valid rep on the live scoreboard.',
        },
      ],
    },
    {
      title: '1v1 Battle Rules & Ranking',
      subtitle: 'Compete in live camera duels or private score battles to level up your athlete tier.',
      badge: 'COMPETITION ⚔️',
      icon: '🏆',
      steps: [
        {
          title: 'Win Outcome (+10 PTS)',
          desc: 'Perform more valid reps than your opponent within the match time limit.',
        },
        {
          title: 'Draw Outcome (+5 PTS)',
          desc: 'Both athletes receive 5 points when finishing with the exact same rep score.',
        },
        {
          title: 'Defeat (-10 PTS)',
          desc: '10 points deducted on defeat, with a protected floor of 0 points.',
        },
        {
          title: '6 Level Mastery Tiers',
          desc: 'Climb through Rookie, Challenger, Warrior, Master, Champion, and Grandmaster!',
        },
      ],
    },
    {
      title: 'Camera Setup & Positioning',
      subtitle: 'Optimal phone placement and room lighting for accurate joint detection.',
      badge: 'PRO TIP 📱',
      icon: '📐',
      steps: [
        {
          title: 'Distance: 5 to 7 Feet',
          desc: 'Prop your phone upright or against a wall so your entire body from head to feet is visible.',
        },
        {
          title: 'Orientation: Landscape Mode',
          desc: 'Landscape video gives the AI tracker the widest field of view during workouts.',
        },
        {
          title: 'Lighting & Contrast',
          desc: 'Avoid strong backlights; ensure you are well-lit against the background for best accuracy.',
        },
      ],
    },
  ];

  return (
    <ScrollView
      style={styles.feedScrollView}
      contentContainerStyle={styles.feedScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. DYNAMIC CURRENT DATE CALENDAR STRIP */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeaderRow}>
          <Text style={styles.calendarMonthText}>{currentMonthYear}</Text>
          <View style={styles.calendarNavButtons}>
            <View style={styles.todayPillBadge}>
              <View style={styles.neonDot} />
              <Text style={styles.todayPillText}>TODAY</Text>
            </View>
          </View>
        </View>

        <View style={styles.daysRow}>
          {currentWeekDays.map((item, index) => {
            const isSelected = selectedDay === item.date;
            return (
              <TouchableOpacity
                key={index}
                style={[styles.dayItem, isSelected && styles.dayItemActive]}
                activeOpacity={0.8}
                onPress={() => setSelectedDay(item.date)}
              >
                <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
                  {item.day}
                </Text>
                <View style={[styles.dateCircle, isSelected && styles.dateCircleActive]}>
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberActive]}>
                    {item.date}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. HERO HIGHLIGHT CHALLENGE CARD (Neon Lime Card) */}
      <TouchableOpacity
        style={styles.heroLimeCard}
        activeOpacity={0.9}
        onPress={() => onExerciseSelect(activeExercise)}
      >
        <View style={styles.heroLimeBody}>
          <View style={styles.heroLimeLeft}>
            <View style={styles.progressTopRow}>
              <Text style={styles.heroProgressTag}>Featured Workout</Text>
              <View style={styles.circularGaugePill}>
                <Flame size={12} color="#11141A" />
              </View>
            </View>

            <Text style={styles.heroMainTitle}>{activeExercise.name} 1v1 Arena</Text>
            <Text style={styles.heroSubTitle}>
              {activeExercise.description || 'Real-time MediaPipe AI Pose Tracker'}
            </Text>

            <View style={styles.caloriesBadgePill}>
              <Swords size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.caloriesBadgeText}>Enter 1v1 Battle</Text>
            </View>
          </View>

          <View style={styles.heroLimeRight}>
            <View style={styles.athleteVisualCircle}>
              <ExerciseIcon
                imageUrl={activeExercise.image_url}
                icon={activeExercise.icon || '🏋️‍♂️'}
                size={54}
                fontSize={32}
              />
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* 3. DYNAMIC TUTORIALS & GUIDES SECTION */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.headerLeftRow}>
          <Lightbulb size={14} color="#E8D5C4" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderTitle}>TUTORIALS & GUIDES</Text>
        </View>
        <Text style={styles.sectionSubHint}>Tap cards for guide</Text>
      </View>

      {/* 2-Column Dynamic Tutorial Cards */}
      <View style={styles.tutorialGridRow}>
        {/* Tutorial 1: AI Pose Tracking (Pastel Lavender) */}
        <TouchableOpacity
          style={[styles.tutorialCard, styles.tutorialCardLavender]}
          activeOpacity={0.88}
          onPress={() => setSelectedTutorial(TUTORIALS[0])}
        >
          <View style={styles.tutorialCardTop}>
            <View style={styles.tutorialBadgeDark}>
              <Text style={styles.tutorialBadgeDarkText}>AI TRACKER</Text>
            </View>
            <Text style={{ fontSize: 22 }}>🧠</Text>
          </View>
          <Text style={styles.tutorialCardTitleDark}>How AI Tracking Works</Text>
          <Text style={styles.tutorialCardDescDark} numberOfLines={2}>
            MediaPipe 33-point skeletal angle tracking for parallel depth.
          </Text>
          <View style={styles.readGuideRow}>
            <Text style={styles.readGuideTextDark}>View Guide</Text>
            <ChevronRight size={12} color="#11141A" />
          </View>
        </TouchableOpacity>

        {/* Tutorial 2: Battle Rules (Pastel Rose) */}
        <TouchableOpacity
          style={[styles.tutorialCard, styles.tutorialCardRose]}
          activeOpacity={0.88}
          onPress={() => setSelectedTutorial(TUTORIALS[1])}
        >
          <View style={styles.tutorialCardTop}>
            <View style={styles.tutorialBadgeDark}>
              <Text style={styles.tutorialBadgeDarkText}>RULES</Text>
            </View>
            <Text style={{ fontSize: 22 }}>🏆</Text>
          </View>
          <Text style={styles.tutorialCardTitleDark}>1v1 Battle Scoring</Text>
          <Text style={styles.tutorialCardDescDark} numberOfLines={2}>
            +10 Win • +5 Draw • -10 Loss rules and level tier progression.
          </Text>
          <View style={styles.readGuideRow}>
            <Text style={styles.readGuideTextDark}>View Guide</Text>
            <ChevronRight size={12} color="#11141A" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Tutorial 3: Camera Positioning (Dark Card with Warm Accents) */}
      <TouchableOpacity
        style={styles.tutorialFullCard}
        activeOpacity={0.88}
        onPress={() => setSelectedTutorial(TUTORIALS[2])}
      >
        <View style={styles.tutorialFullBody}>
          <View style={styles.tutorialIconBox}>
            <Smartphone size={22} color="#E8D5C4" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={styles.fullCardBadgeRow}>
              <Text style={styles.fullCardBadgeText}>SETUP GUIDE</Text>
            </View>
            <Text style={styles.fullCardTitle}>Camera Positioning & Distance</Text>
            <Text style={styles.fullCardDesc} numberOfLines={2}>
              Place phone 5-7 ft away in landscape orientation with full body visible.
            </Text>
          </View>
          <View style={styles.fullCardArrowCircle}>
            <ChevronRight size={16} color="#11141A" />
          </View>
        </View>
      </TouchableOpacity>

      {/* 4. ONLINE FRIENDS SECTION */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.headerLeftRow}>
          <Users size={14} color="#E8D5C4" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderTitle}>ONLINE ATHLETES</Text>
        </View>
        <View style={styles.onlineBadgePill}>
          <View style={styles.pulseGreenDot} />
          <Text style={styles.onlineBadgeText}>{onlineCount} Online</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalAvatarRow}
      >
        {/* Add Friend Button */}
        <TouchableOpacity
          style={styles.avatarItem}
          activeOpacity={0.8}
          onPress={() => onNavigateToTab?.('profile')}
        >
          <View style={styles.addFriendCircle}>
            <UserPlus size={22} color="#E8D5C4" />
            <View style={styles.plusIconBadge}>
              <Plus size={10} color="#11141A" strokeWidth={3} />
            </View>
          </View>
          <Text style={styles.avatarLabel} numberOfLines={1}>
            Add Friend
          </Text>
        </TouchableOpacity>

        {/* Real Friends List */}
        {friends.map((item) => (
          <TouchableOpacity
            key={item.friendship_id}
            style={styles.avatarItem}
            activeOpacity={0.8}
            onPress={() => onNavigateToTab?.('profile')}
          >
            <View style={styles.avatarWrapper}>
              <Avatar
                username={item.friend.username}
                size={54}
                config={item.friend.avatar_config}
                avatarUrl={item.friend.avatar_url}
              />
            </View>
            <Text style={styles.avatarLabel} numberOfLines={1}>
              {item.friend.username}
            </Text>
          </TouchableOpacity>
        ))}

        {friends.length === 0 && !loadingFriends && (
          <TouchableOpacity
            style={styles.avatarItem}
            activeOpacity={0.8}
            onPress={() => onNavigateToTab?.('profile')}
          >
            <View style={[styles.avatarWrapper, styles.placeholderFriendCircle]}>
              <Avatar username="ojas_bot" size={54} />
            </View>
            <Text style={styles.avatarLabel} numberOfLines={1}>
              OjasBot
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* TUTORIAL DETAILS MODAL */}
      <Modal
        visible={!!selectedTutorial}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTutorial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.tutorialModalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalBadgePill}>
                <Text style={styles.modalBadgeText}>{selectedTutorial?.badge}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                activeOpacity={0.8}
                onPress={() => setSelectedTutorial(null)}
              >
                <X size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>{selectedTutorial?.title}</Text>
            <Text style={styles.modalSubtitle}>{selectedTutorial?.subtitle}</Text>

            <ScrollView style={styles.modalStepsScroll} showsVerticalScrollIndicator={false}>
              {selectedTutorial?.steps.map((step, idx) => (
                <View key={idx} style={styles.modalStepRow}>
                  <View style={styles.stepNumberBadge}>
                    <CheckCircle2 size={16} color="#E8D5C4" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.gotItButton}
              activeOpacity={0.85}
              onPress={() => setSelectedTutorial(null)}
            >
              <Text style={styles.gotItButtonText}>Got It!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  feedScrollView: {
    flex: 1,
    backgroundColor: '#1A1C20',
  },
  feedScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 130,
  },
  calendarCard: {
    backgroundColor: '#161B22',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarMonthText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  calendarNavButtons: {
    flexDirection: 'row',
  },
  todayPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A32',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  neonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E25822',
  },
  todayPillText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '900',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  dayItemActive: {},
  dayLetter: {
    color: '#8E95A0',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  dayLetterActive: {
    color: '#E25822',
  },
  dateCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  dateCircleActive: {
    backgroundColor: '#E25822',
  },
  dateNumber: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  dateNumberActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  heroLimeCard: {
    backgroundColor: '#E25822',
    borderRadius: 26,
    padding: 22,
    marginBottom: 24,
    shadowColor: '#E25822',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroLimeBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLimeLeft: {
    flex: 1,
  },
  progressTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  heroProgressTag: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  circularGaugePill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMainTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
  },
  heroSubTitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  caloriesBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11141A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 16,
  },
  caloriesBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  heroLimeRight: {
    marginLeft: 14,
  },
  athleteVisualCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  athleteEmoji: {
    fontSize: 38,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionSubHint: {
    color: '#8E95A0',
    fontSize: 11,
    fontWeight: '600',
  },
  tutorialGridRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  tutorialCard: {
    flex: 1,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
    minHeight: 164,
  },
  tutorialCardLavender: {
    backgroundColor: '#C8B6FF', // Soft pastel lavender
  },
  tutorialCardRose: {
    backgroundColor: '#FFD6E0', // Soft pastel rose
  },
  tutorialCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tutorialBadgeDark: {
    backgroundColor: 'rgba(17, 20, 26, 0.1)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tutorialBadgeDarkText: {
    color: '#11141A',
    fontSize: 9,
    fontWeight: '900',
  },
  tutorialCardTitleDark: {
    color: '#11141A',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  tutorialCardDescDark: {
    color: '#374151',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  readGuideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  readGuideTextDark: {
    color: '#11141A',
    fontSize: 11,
    fontWeight: '800',
    marginRight: 2,
  },
  tutorialFullCard: {
    backgroundColor: '#262A32',
    borderRadius: 24,
    padding: 18,
    marginBottom: 26,
  },
  tutorialFullBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tutorialIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#323742',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullCardBadgeRow: {
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  fullCardBadgeText: {
    color: '#E25822',
    fontSize: 9,
    fontWeight: '900',
  },
  fullCardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  fullCardDesc: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  fullCardArrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E25822',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  onlineBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderWidth: 1,
    borderColor: '#E25822',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  pulseGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E25822',
  },
  onlineBadgeText: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '800',
  },
  horizontalAvatarRow: {
    gap: 16,
    paddingVertical: 4,
    marginBottom: 24,
  },
  avatarItem: {
    alignItems: 'center',
    width: 64,
  },
  avatarWrapper: {
    position: 'relative',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderFriendCircle: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 28,
  },
  onlinePresenceDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E25822',
    borderWidth: 2,
    borderColor: '#1A1C20',
  },
  addFriendCircle: {
    position: 'relative',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#262A32',
    borderWidth: 1.5,
    borderColor: '#E25822',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusIconBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E25822',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  aiTrackerCard: {
    backgroundColor: '#262A32',
    borderRadius: 24,
    padding: 16,
  },
  aiCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E25822',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  aiCardSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  aiCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  settingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#323742',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  settingsPillText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  launchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  launchPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  tutorialModalCard: {
    backgroundColor: '#262A32',
    borderRadius: 28,
    padding: 22,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1.5,
    borderColor: '#E25822',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalBadgePill: {
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.3)',
  },
  modalBadgeText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#323742',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
    marginBottom: 14,
  },
  modalStepsScroll: {
    maxHeight: 260,
  },
  modalStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#323742',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  stepNumberBadge: {
    marginTop: 2,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  stepDesc: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  gotItButton: {
    backgroundColor: '#E25822',
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  gotItButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
