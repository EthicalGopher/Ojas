import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  BookOpen,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Info,
  Lightbulb,
  Lock,
  Play,
  Plus,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  Swords,
  Trophy,
  UserPlus,
  Users,
  Volume2,
  X,
  Zap,
} from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { useUserStore } from '../store/userStore';
import { fetchFriends, FriendshipItem } from '../utils/friendService';
import { DEFAULT_EXERCISES, ExerciseItem } from '../utils/exerciseService';
import { updateUserProfile, UserProfile } from '../utils/profileService';
import { HealthAssessmentModal } from '../components/HealthAssessmentModal';
import {
  HEALTH_CONDITIONS,
} from '../utils/exerciseRecommendations';
import { DailyChallengesSection } from '../components/DailyChallengesSection';
import { useDailyChallengeStore } from '../store/dailyChallengeStore';

export type { ExerciseItem };

interface HomeFeedScreenProps {
  onlineCount: number;
  selectedModel: 'light' | 'medium' | 'high';
  exercises?: ExerciseItem[];
  onExerciseSelect: (exercise: ExerciseItem) => void;
  onSettingsPress: () => void;
  onOpenCamera: (exerciseId?: string, exerciseName?: string, isTutor?: boolean) => void;
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
  exercises = DEFAULT_EXERCISES,
  onExerciseSelect,
  onSettingsPress,
  onOpenCamera,
  onNavigateToTab,
  featuredExercise,
}) => {
  const { user, profile, setProfile, isGuest } = useUserStore();
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(false);
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialModalData | null>(null);
  const [showHealthModal, setShowHealthModal] = useState<boolean>(false);

  // Single-question progressive flow (0 to 4)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [isSurveyCompleted, setIsSurveyCompleted] = useState<boolean>(false);

  useEffect(() => {
    if (profile?.health_conditions_completed === true) {
      setIsSurveyCompleted(true);
    }
  }, [profile?.health_conditions_completed]);

  const handleAnswerQuestion = async (value: boolean) => {
    const currentCond = HEALTH_CONDITIONS[currentQuestionIndex];
    if (!currentCond) return;

    const currentMap: Record<string, boolean> = {
      knock_knees: profile?.has_knock_knees ?? (profile?.health_conditions?.knock_knees ?? false),
      bow_legs: profile?.has_bow_legs ?? (profile?.health_conditions?.bow_legs ?? false),
      flat_feet: profile?.has_flat_feet ?? (profile?.health_conditions?.flat_feet ?? false),
      lower_back_pain: profile?.has_lower_back_pain ?? (profile?.health_conditions?.lower_back_pain ?? false),
      rounded_shoulders: profile?.has_rounded_shoulders ?? (profile?.health_conditions?.rounded_shoulders ?? false),
    };

    currentMap[currentCond.key] = value;

    const isLast = currentQuestionIndex >= HEALTH_CONDITIONS.length - 1;

    const updates: Partial<UserProfile> = {
      has_knock_knees: currentMap['knock_knees'],
      has_bow_legs: currentMap['bow_legs'],
      has_flat_feet: currentMap['flat_feet'],
      has_lower_back_pain: currentMap['lower_back_pain'],
      has_rounded_shoulders: currentMap['rounded_shoulders'],
      health_conditions_completed: isLast ? true : (profile?.health_conditions_completed || false),
      health_conditions: currentMap,
    };

    const newProfile = { ...(profile || {}), ...updates } as UserProfile;
    setProfile(newProfile);

    if (user?.id && !isGuest) {
      updateUserProfile(user.id, updates).catch((err) => {
        console.warn('Failed to sync condition to Supabase:', err);
      });
    }

    // Immediately remove this question and advance to next question
    if (!isLast) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      setIsSurveyCompleted(true);
    }
  };

  const handleRestartSurvey = () => {
    setCurrentQuestionIndex(0);
    setIsSurveyCompleted(false);
  };


  const activeExercise: ExerciseItem = featuredExercise || {
    id: '1',
    name: 'Squats',
    category: 'strength',
    icon: '🏋️',
    isFavorite: true,
    description: 'AI Real-time MediaPipe Pose Tracker for Parallel Depth & Rep Counting',
  };

  // Dynamic Current Date & Week Days Generation
  const { currentMonthYear, currentWeekDays, todayDateNumber, todayDateString } = useMemo(() => {
    const today = new Date();
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthYear = `${monthNames[today.getMonth()]} ${today.getFullYear()}`;
    const todayDateNumber = today.getDate();
    const todayDateString = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Find the Monday of current week
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const dayInitials = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const currentWeekDays = dayInitials.map((initial, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateString = `${yyyy}-${mm}-${dd}`;
      return {
        day: initial,
        date: d.getDate(),
        dateString,
        fullDate: d,
        isToday: d.toDateString() === today.toDateString(),
      };
    });

    return { currentMonthYear, currentWeekDays, todayDateNumber, todayDateString };
  }, []);

  const [selectedDateString, setSelectedDateString] = useState<string>(todayDateString);
  const selectedDayItem = currentWeekDays.find((d) => d.dateString === selectedDateString) || currentWeekDays.find((d) => d.isToday) || currentWeekDays[0];

  // Live exercise progress & calories for today
  const exerciseProgressToday = useDailyChallengeStore((state) => state.exerciseProgressToday);
  const liveCaloriesToday = useMemo(() => {
    return useDailyChallengeStore.getState().getTodayTotalCalories();
  }, [exerciseProgressToday]);

  // Daily calories from Supabase profile table merged with real-time live session stats
  const dailyCaloriesMap = profile?.daily_calories || {};
  const isSelectedDateToday = selectedDateString === todayDateString;
  const selectedDayLog = dailyCaloriesMap[selectedDateString] || {
    date: selectedDateString,
    calories: 0,
    reps: 0,
    matches: 0,
  };

  const dayCaloriesBurned = isSelectedDateToday
    ? Math.max(selectedDayLog.calories || 0, liveCaloriesToday)
    : (selectedDayLog.calories || 0);
  const dayRepsCompleted = selectedDayLog.reps || 0;
  const dayMatchesPlayed = selectedDayLog.matches || 0;
  const totalCaloriesAllTime = (profile?.total_calories || 0) + (isSelectedDateToday ? Math.max(0, liveCaloriesToday - (selectedDayLog.calories || 0)) : 0);

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
      badge: 'AI TECHNOLOGY',
      icon: '',
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
      badge: 'COMPETITION',
      icon: '',
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
      badge: 'PRO TIP',
      icon: '',
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
      {/* 1. DYNAMIC CURRENT DATE CALENDAR STRIP & CALORIES BURNED TRACKER */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeaderRow}>
          <Text style={styles.calendarMonthText}>{currentMonthYear}</Text>
          <View style={styles.calendarNavButtons}>
            <View style={styles.todayPillBadge}>
              <View style={styles.neonDot} />
              <Text style={styles.todayPillText}>
                {selectedDayItem?.isToday ? 'TODAY' : selectedDateString}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.daysRow}>
          {currentWeekDays.map((item, index) => {
            const isSelected = selectedDateString === item.dateString;
            const dayCalories = dailyCaloriesMap[item.dateString]?.calories || 0;
            const hasActivity = dayCalories > 0;

            return (
              <TouchableOpacity
                key={index}
                style={[styles.dayItem, isSelected && styles.dayItemActive]}
                activeOpacity={0.8}
                onPress={() => setSelectedDateString(item.dateString)}
              >
                <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
                  {item.day}
                </Text>
                <View style={[styles.dateCircle, isSelected && styles.dateCircleActive]}>
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberActive]}>
                    {item.date}
                  </Text>
                </View>
                {/* Micro activity indicator dot if calories were burned on this date */}
                {hasActivity && (
                  <View style={[styles.calDotBadge, isSelected && styles.calDotBadgeActive]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date-Specific Calories Burn Summary Box */}
        <View style={styles.calendarCalorieRow}>
          <View style={styles.calendarCalorieLeft}>
            <View style={styles.calFlameIconCircle}>
              <Activity size={16} color="#FF6B35" />
            </View>
            <View>
              <Text style={styles.calBurnNumberText}>
                {dayCaloriesBurned} <Text style={styles.calBurnUnitText}>kcal</Text>
              </Text>
              <Text style={styles.calBurnLabelText}>
                {selectedDayItem?.isToday
                  ? "Today's Energy Burned"
                  : `Burned on ${selectedDayItem?.fullDate?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || selectedDateString}`}
              </Text>
            </View>
          </View>

          <View style={styles.calendarCalorieStatsRight}>
            <View style={styles.calMiniStatPill}>
              <Text style={styles.calMiniStatVal}>{dayRepsCompleted}</Text>
              <Text style={styles.calMiniStatLbl}>REPS</Text>
            </View>
            <View style={styles.calMiniStatPill}>
              <Text style={styles.calMiniStatVal}>{dayMatchesPlayed}</Text>
              <Text style={styles.calMiniStatLbl}>MATCHES</Text>
            </View>
          </View>
        </View>
      </View>

      {/* DAILY EXERCISE & ILLNESS THERAPY CHALLENGES AT TOP */}
      <DailyChallengesSection
        exercises={exercises}
        profile={profile}
        selectedDateString={selectedDateString}
        onOpenCamera={onOpenCamera}
        onExerciseSelect={onExerciseSelect}
      />

      {/* DIRECT QUESTION & YES/NO (NO BOX CONTAINER) */}
      {!isSurveyCompleted && (() => {
        const currentCond = HEALTH_CONDITIONS[currentQuestionIndex];
        if (!currentCond) return null;

        return (
          <View style={styles.directQuestionWrapper}>
            <Text style={styles.directQuestionPrompt}>{currentCond.question}</Text>

            <View style={styles.directActionsRow}>
              <TouchableOpacity
                style={styles.directYesBtn}
                activeOpacity={0.85}
                onPress={() => handleAnswerQuestion(true)}
              >
                <Check size={18} color="#FFFFFF" strokeWidth={3} style={{ marginRight: 6 }} />
                <Text style={styles.directYesBtnText}>Yes</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.directNoBtn}
                activeOpacity={0.85}
                onPress={() => handleAnswerQuestion(false)}
              >
                <X size={18} color="#CBD5E1" strokeWidth={2.5} style={{ marginRight: 6 }} />
                <Text style={styles.directNoBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}



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
                <Zap size={12} color="#11141A" />
              </View>
            </View>

            <Text style={styles.heroMainTitle}>{activeExercise.name} 1v1 Arena</Text>
            <Text style={styles.heroSubTitle}>
              {activeExercise.description || 'Real-time MediaPipe AI Pose Tracker'}
            </Text>

            <TouchableOpacity
              style={[styles.caloriesBadgePill, isGuest && { backgroundColor: '#1E293B', opacity: 0.85 }]}
              activeOpacity={0.8}
              onPress={(e) => {
                if (isGuest) {
                  e.stopPropagation();
                  Alert.alert(
                    '🔒 1v1 Arena Locked',
                    'Sign in or create a free athlete account to duel live players in real-time battles.',
                    [{ text: 'OK' }]
                  );
                } else {
                  onExerciseSelect(activeExercise);
                }
              }}
            >
              {isGuest ? (
                <>
                  <Lock size={12} color="#94A3B8" style={{ marginRight: 5 }} />
                  <Text style={[styles.caloriesBadgeText, { color: '#94A3B8' }]}>1v1 Arena (Sign In to Unlock)</Text>
                </>
              ) : (
                <>
                  <Swords size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.caloriesBadgeText}>Enter 1v1 Battle</Text>
                </>
              )}
            </TouchableOpacity>
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

      {/* 3. AI TUTOR SECTION FOR ALL EXERCISES (Small, Rounded Square Horizontal FlatList) */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.headerLeftRow}>
          <Bot size={16} color="#E25822" style={{ marginRight: 6 }} />
          <Text style={styles.sectionHeaderTitle}>AI TUTOR</Text>
        </View>
        <Text style={styles.sectionSubHint}>Live Pose Coach</Text>
      </View>

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tutorFlatListContent}
        renderItem={({ item, index }) => {
          const defaultPalettes = ['#C8B6FF', '#FFD6E0', '#E25822', '#354394'];
          const cardBg = item.bg_theme || defaultPalettes[index % defaultPalettes.length];
          const isDarkCard = cardBg === '#354394' || cardBg === '#E25822';
          const textColor = isDarkCard ? '#FFFFFF' : '#11141A';
          const subTextColor = isDarkCard ? '#E2E8F0' : '#4B5563';
          const duration = item.duration_mins || (index % 2 === 0 ? 32 : 25);

          return (
            <TouchableOpacity
              style={[styles.tutorSquareCard, { backgroundColor: cardBg }]}
              activeOpacity={0.88}
              onPress={() => onOpenCamera(item.id, item.name, true)}
            >
              {/* Top Row: Category Pill & Duration Badge */}
              <View style={styles.tutorSquareTopRow}>
                <View style={[styles.tutorSquareCategoryPill, isDarkCard && { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                  <Text style={[styles.tutorSquareCategoryText, { color: textColor }]}>
                    {item.category?.toUpperCase() || 'FITNESS'}
                  </Text>
                </View>
                <View style={styles.tutorSquareDurationBadge}>
                  <Text style={styles.tutorSquareDurationText}>{duration}m</Text>
                </View>
              </View>

              {/* Center: Athletic Visual Icon */}
              <View style={styles.tutorSquareIconWrap}>
                <ExerciseIcon
                  imageUrl={item.image_url}
                  icon={item.icon}
                  size={46}
                  fontSize={26}
                />
              </View>

              {/* Bottom: Name & Mini Play Action */}
              <View style={styles.tutorSquareBottomRow}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={[styles.tutorSquareTitle, { color: textColor }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.tutorSquareSub, { color: subTextColor }]} numberOfLines={1}>
                    Voice & Pose
                  </Text>
                </View>

                <View style={[styles.tutorSquarePlayCircle, isDarkCard && { backgroundColor: '#FFFFFF' }]}>
                  <Play size={10} color={isDarkCard ? '#11141A' : '#FFFFFF'} fill={isDarkCard ? '#11141A' : '#FFFFFF'} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* 4. DYNAMIC TUTORIALS & GUIDES SECTION */}
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
            <Bot size={18} color="#11141A" />
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
            <Swords size={18} color="#11141A" />
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

      {/* HEALTH & POSTURE ASSESSMENT MODAL */}
      <HealthAssessmentModal
        visible={showHealthModal}
        onClose={() => setShowHealthModal(false)}
      />
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
  calDotBadge: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF6B35',
    marginTop: 4,
  },
  calDotBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  calendarCalorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  calendarCalorieLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calFlameIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calBurnNumberText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  calBurnUnitText: {
    color: '#FF6B35',
    fontSize: 12,
    fontWeight: '800',
  },
  calBurnLabelText: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },
  calendarCalorieStatsRight: {
    flexDirection: 'row',
    gap: 8,
  },
  calMiniStatPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 46,
  },
  calMiniStatVal: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '800',
  },
  calMiniStatLbl: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  ttsRateLimitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ttsRateLimitText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  tutorFlatListContent: {
    gap: 12,
    paddingBottom: 8,
    marginBottom: 16,
  },
  tutorSquareCard: {
    width: 142,
    height: 142,
    borderRadius: 22,
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  tutorSquareTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tutorSquareCategoryPill: {
    backgroundColor: 'rgba(17, 20, 26, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tutorSquareCategoryText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tutorSquareDurationBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tutorSquareDurationText: {
    color: '#11141A',
    fontSize: 9,
    fontWeight: '900',
  },
  tutorSquareIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  tutorSquareBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 20, 26, 0.08)',
  },
  tutorSquareTitle: {
    fontSize: 13,
    fontWeight: '900',
  },
  tutorSquareSub: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  tutorSquarePlayCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
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
  /* Direct Minimal Question (No Box Container) */
  directQuestionWrapper: {
    marginTop: 14,
    marginBottom: 32,
    paddingHorizontal: 2,
  },
  directQuestionPrompt: {
    fontSize: 16,
    color: '#F8FAFC',
    lineHeight: 23,
    fontWeight: '700',
    marginBottom: 18,
  },
  directActionsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  directYesBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    paddingVertical: 15,
    borderRadius: 16,
  },
  directYesBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  directNoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 15,
    borderRadius: 16,
  },
  directNoBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#E2E8F0',
  },
  /* Tailored Recommended Carousel - ExercisesScreen UI Style */
  recSectionHeader: {
    flexDirection: 'column',
    marginBottom: 14,
    marginTop: 8,
  },
  recSectionSubHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E25822',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  recFlatList: {
    marginBottom: 24,
  },
  recExercisesScrollContent: {
    paddingRight: 24,
    gap: 16,
    paddingBottom: 6,
    paddingTop: 2,
  },
  recWorkoutCard: {
    width: 260,
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  recCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  recCardTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    flex: 1,
    marginRight: 8,
    lineHeight: 21,
  },
  recDurationBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  recDurationBadgeNumber: {
    color: '#11141A',
    fontSize: 12.5,
    fontWeight: '900',
    lineHeight: 14,
  },
  recDurationBadgeUnit: {
    color: '#4B5563',
    fontSize: 8.5,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  recCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  recAthleteVisualCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recCardTagsWrapper: {
    flex: 1,
    marginLeft: 12,
    gap: 6,
  },
  recTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    alignSelf: 'flex-start',
  },
  recDarkDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#11141A',
    marginRight: 6,
  },
  recTagPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  recLevelPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  recLevelPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  recCardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 20, 26, 0.08)',
  },
  recAiTagPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  recAiTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  recPlayArrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
