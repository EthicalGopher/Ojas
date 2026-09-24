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
  Scan,
  Flame,
} from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { useUserStore } from '../store/userStore';
import { fetchFriends, FriendshipItem } from '../utils/friendService';
import { DEFAULT_EXERCISES, ExerciseItem } from '../utils/exerciseService';
import { updateUserProfile, UserProfile } from '../utils/profileService';
import { HealthAssessmentModal } from '../components/HealthAssessmentModal';
import { DeformityScannerModal } from '../features/camera/components/DeformityScannerModal';
import {
  HEALTH_CONDITIONS,
} from '../utils/exerciseRecommendations';
import { DailyChallengesSection } from '../components/DailyChallengesSection';
import { useDailyChallengeStore } from '../store/dailyChallengeStore';
import { useGameStats } from '../hooks/useGameStats';
import { isActiveDay, toDateKey, XP_PER_MATCH } from '../utils/gamification';
import { cardThemes, colors, radius, shadow } from '../theme';

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
  onOpenAiDuel?: (exerciseId?: string) => void;
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
  onOpenAiDuel,
}) => {
  const { user, profile, setProfile, isGuest } = useUserStore();
  const { level, streak } = useGameStats();
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(false);
  const [selectedTutorial, setSelectedTutorial] = useState<TutorialModalData | null>(null);
  const [showHealthModal, setShowHealthModal] = useState<boolean>(false);
  const [isDeformityScannerVisible, setIsDeformityScannerVisible] = useState<boolean>(false);

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
    // Local date, matching the week strip below and how activity is saved.
    const todayDateString = toDateKey(today);

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

  const streakMessage = streak.activeToday
    ? `${streak.current}-day streak secured. Come back tomorrow to keep it going.`
    : streak.atRisk
    ? `Your ${streak.current}-day streak ends tonight. One workout keeps it alive.`
    : 'Finish any workout today to start a streak.';

  const TUTORIAL_CARDS = [
    { tutorial: TUTORIALS[0], tag: 'AI TRACKER', title: 'How AI Tracking Works', Icon: Bot, tint: colors.lavender },
    { tutorial: TUTORIALS[1], tag: 'RULES', title: '1v1 Battle Scoring', Icon: Swords, tint: colors.flame },
    { tutorial: TUTORIALS[2], tag: 'SETUP', title: 'Camera Positioning', Icon: Smartphone, tint: colors.accent },
  ];

  const SectionHeader = ({
    Icon,
    title,
    right,
  }: {
    Icon: React.ComponentType<{ size?: number; color?: string }>;
    title: string;
    right?: React.ReactNode;
  }) => (
    <View style={styles.sectionHeaderRow}>
      <View style={styles.headerLeftRow}>
        <Icon size={15} color={colors.accent} />
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );

  return (
    <ScrollView
      style={styles.feedScrollView}
      contentContainerStyle={styles.feedScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. CALENDAR + STREAK */}
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeaderRow}>
          <Text style={styles.calendarMonthText}>{currentMonthYear}</Text>
          <View style={[styles.streakChip, streak.activeToday && styles.streakChipLit]}>
            <Flame
              size={13}
              color={streak.activeToday ? '#FFFFFF' : streak.current > 0 ? colors.flame : cardThemes.navy.sub}
              fill={streak.activeToday ? '#FFFFFF' : 'transparent'}
            />
            <Text style={styles.streakChipText}>
              {streak.current} day streak
            </Text>
          </View>
        </View>

        <View style={styles.daysRow}>
          {currentWeekDays.map((item) => {
            const isSelected = selectedDateString === item.dateString;
            const active = isActiveDay(profile, item.dateString) || (item.isToday && streak.activeToday);

            return (
              <TouchableOpacity
                key={item.dateString}
                style={styles.dayItem}
                activeOpacity={0.8}
                onPress={() => setSelectedDateString(item.dateString)}
              >
                <Text style={[styles.dayLetter, (isSelected || item.isToday) && styles.dayLetterActive]}>
                  {item.day}
                </Text>
                <View
                  style={[
                    styles.dateCircle,
                    item.isToday && !isSelected && styles.dateCircleToday,
                    isSelected && styles.dateCircleSelected,
                  ]}
                >
                  <Text style={[styles.dateNumber, isSelected && styles.dateNumberSelected]}>{item.date}</Text>
                </View>
                <View style={styles.dayMarker}>
                  {active && <Flame size={11} color={colors.flame} fill={colors.flame} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.streakMessage}>{streakMessage}</Text>

        <View style={styles.calendarCalorieRow}>
          <View style={styles.calendarCalorieLeft}>
            <View style={styles.calFlameIconCircle}>
              <Activity size={17} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.calBurnNumberText}>
                {dayCaloriesBurned} <Text style={styles.calBurnUnitText}>kcal</Text>
              </Text>
              <Text style={styles.calBurnLabelText}>
                {selectedDayItem?.isToday
                  ? "Today's energy burned"
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

      {/* 2. LEVEL PROGRESS */}
      <TouchableOpacity style={styles.levelStrip} activeOpacity={0.85} onPress={() => onNavigateToTab?.('profile')}>
        <View style={styles.levelStripBadge}>
          <Text style={styles.levelStripBadgeLabel}>LV</Text>
          <Text style={styles.levelStripBadgeText}>{level.level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.levelStripTopRow}>
            <Text style={styles.levelStripTitle}>{level.title}</Text>
            <Text style={styles.levelStripXp}>
              {level.xpForNextLevel - level.xpIntoLevel} XP to level {level.level + 1}
            </Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.max(3, level.progress * 100)}%` }]} />
          </View>
        </View>
      </TouchableOpacity>

      {/* 3. DAILY QUESTS */}
      <DailyChallengesSection
        exercises={exercises}
        profile={profile}
        selectedDateString={selectedDateString}
        onOpenCamera={onOpenCamera}
        onExerciseSelect={onExerciseSelect}
      />

      {/* 4. HEALTH CHECK-IN QUESTION */}
      {!isSurveyCompleted && (() => {
        const currentCond = HEALTH_CONDITIONS[currentQuestionIndex];
        if (!currentCond) return null;

        return (
          <View style={styles.questionCard}>
            <View style={styles.questionTopRow}>
              <View style={styles.questionTag}>
                <Text style={styles.questionTagText}>BODY CHECK-IN</Text>
              </View>
              <Text style={styles.questionCounter}>
                {currentQuestionIndex + 1}/{HEALTH_CONDITIONS.length}
              </Text>
            </View>
            <Text style={styles.questionPrompt}>{currentCond.question}</Text>
            <Text style={styles.questionHint}>Your answers tailor tomorrow's quests.</Text>

            <View style={styles.questionActions}>
              <TouchableOpacity style={styles.yesBtn} activeOpacity={0.85} onPress={() => handleAnswerQuestion(true)}>
                <Check size={18} color={colors.onAccent} strokeWidth={3} />
                <Text style={styles.yesBtnText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.noBtn} activeOpacity={0.85} onPress={() => handleAnswerQuestion(false)}>
                <X size={18} color={cardThemes.pink.text} strokeWidth={2.5} />
                <Text style={styles.noBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* 5. GAME MODES */}
      <SectionHeader
        Icon={Swords}
        title="GAME MODES"
        right={
          <View style={styles.onlineBadgePill}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.onlineBadgeText}>{onlineCount} online</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.arenaCard}
        activeOpacity={0.92}
        onPress={() => {
          if (isGuest) {
            Alert.alert(
              '1v1 Arena Locked',
              'Sign in or create a free athlete account to duel live players in real-time battles.',
              [{ text: 'OK' }]
            );
            return;
          }
          onExerciseSelect(activeExercise);
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.modeTagRow}>
            <View style={styles.modeTag}>
              <Text style={styles.modeTagText}>RANKED</Text>
            </View>
            <View style={styles.rewardTag}>
              <Text style={styles.rewardTagText}>+{XP_PER_MATCH} XP</Text>
            </View>
          </View>
          <Text style={styles.arenaTitle}>{activeExercise.name} 1v1 Arena</Text>
          <Text style={styles.arenaSub} numberOfLines={2}>
            Live camera battle. Most clean reps wins.
          </Text>
          <View style={styles.playBtn}>
            {isGuest ? <Lock size={13} color={colors.text} /> : <Play size={13} color={colors.text} fill={colors.text} />}
            <Text style={styles.playBtnText}>{isGuest ? 'Sign in to play' : 'Play now'}</Text>
          </View>
        </View>
        <ExerciseIcon
          imageUrl={activeExercise.image_url}
          icon={activeExercise.icon || '🏋️‍♂️'}
          size={72}
          fontSize={40}
        />
      </TouchableOpacity>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: colors.lavender }]}
          activeOpacity={0.9}
          onPress={() => onOpenAiDuel?.(activeExercise.id)}
        >
          <View style={styles.modeIconCircle}>
            <Bot size={20} color={colors.textOnLight} />
          </View>
          <Text style={styles.modeTitle}>Human vs AI</Text>
          <Text style={styles.modeSub}>Beat 4 bot levels</Text>
          <View style={styles.modeFooter}>
            <Text style={styles.modeFooterText}>2 MIN DUEL</Text>
            <ChevronRight size={16} color={colors.textOnLight} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeCard, { backgroundColor: colors.pink }]}
          activeOpacity={0.9}
          onPress={() => setIsDeformityScannerVisible(true)}
        >
          <View style={styles.modeIconCircle}>
            <Scan size={20} color={colors.textOnLight} />
          </View>
          <Text style={styles.modeTitle}>Posture Scan</Text>
          <Text style={styles.modeSub}>Knees, spine & shoulders</Text>
          <View style={styles.modeFooter}>
            <Text style={styles.modeFooterText}>3 SEC SCAN</Text>
            <ChevronRight size={16} color={colors.textOnLight} />
          </View>
        </TouchableOpacity>
      </View>

      {/* 6. AI COACH */}
      <SectionHeader Icon={Bot} title="AI COACH" right={<Text style={styles.sectionSubHint}>Voice + pose feedback</Text>} />

      <FlatList
        data={exercises}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tutorFlatListContent}
        renderItem={({ item, index }) => {
          const defaultPalettes = [colors.lavender, colors.pink, colors.flame, colors.navy];
          const cardBg = item.bg_theme || defaultPalettes[index % defaultPalettes.length];
          const isDarkCard = cardBg === colors.navy || cardBg === colors.flame;
          const textColor = isDarkCard ? colors.text : colors.textOnLight;
          const subTextColor = isDarkCard ? '#E2E8F0' : '#4B5563';
          const duration = item.duration_mins || (index % 2 === 0 ? 32 : 25);

          return (
            <TouchableOpacity
              style={[styles.tutorCard, { backgroundColor: cardBg }]}
              activeOpacity={0.88}
              onPress={() => onOpenCamera(item.id, item.name, true)}
            >
              <View style={styles.tutorTopRow}>
                <View style={[styles.tutorCategoryPill, isDarkCard && { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                  <Text style={[styles.tutorCategory, { color: textColor }]}>
                    {item.category?.toUpperCase() || 'FITNESS'}
                  </Text>
                </View>
                <View style={styles.tutorDurationBadge}>
                  <Text style={styles.tutorDuration}>{duration}m</Text>
                </View>
              </View>
              <View style={styles.tutorIconWrap}>
                <ExerciseIcon imageUrl={item.image_url} icon={item.icon} size={48} fontSize={28} />
              </View>
              <View style={styles.tutorBottomRow}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={[styles.tutorTitle, { color: textColor }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.tutorSub, { color: subTextColor }]} numberOfLines={1}>Voice & Pose</Text>
                </View>
                <View style={[styles.tutorPlay, isDarkCard && { backgroundColor: colors.text }]}>
                  <Play size={10} color={isDarkCard ? colors.textOnLight : colors.text} fill={isDarkCard ? colors.textOnLight : colors.text} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* 7. GUIDES */}
      <SectionHeader Icon={Lightbulb} title="GUIDES" right={<Text style={styles.sectionSubHint}>Tap for guide</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.guideRow}>
        {TUTORIAL_CARDS.map(({ tutorial, tag, title, Icon }, i) => {
          const theme = [cardThemes.lavender, cardThemes.pink, cardThemes.orange][i % 3];
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.guideCard, { backgroundColor: theme.bg }]}
              activeOpacity={0.88}
              onPress={() => setSelectedTutorial(tutorial)}
            >
              <View style={[styles.guideIcon, { backgroundColor: theme.chip }]}>
                <Icon size={18} color={theme.text} />
              </View>
              <Text style={[styles.guideTag, { color: theme.sub }]}>{tag}</Text>
              <Text style={[styles.guideTitle, { color: theme.text }]}>{title}</Text>
              <Text style={[styles.guideDesc, { color: theme.sub }]} numberOfLines={2}>{tutorial.subtitle}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 8. SQUAD */}
      <SectionHeader Icon={Users} title="YOUR SQUAD" right={<Text style={styles.sectionSubHint}>{friends.length} friends</Text>} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalAvatarRow}>
        <TouchableOpacity style={styles.avatarItem} activeOpacity={0.8} onPress={() => onNavigateToTab?.('profile')}>
          <View style={styles.addFriendCircle}>
            <UserPlus size={22} color={colors.accent} />
          </View>
          <Text style={styles.avatarLabel} numberOfLines={1}>Invite</Text>
        </TouchableOpacity>

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
            <Text style={styles.avatarLabel} numberOfLines={1}>{item.friend.username}</Text>
          </TouchableOpacity>
        ))}

        {friends.length === 0 && !loadingFriends && (
          <View style={styles.squadEmpty}>
            <Text style={styles.squadEmptyTitle}>Train together, win together</Text>
            <Text style={styles.squadEmptySub}>Add friends to send 1-tap battle invites.</Text>
          </View>
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
              <TouchableOpacity style={styles.modalCloseBtn} activeOpacity={0.8} onPress={() => setSelectedTutorial(null)}>
                <X size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTitle}>{selectedTutorial?.title}</Text>
            <Text style={styles.modalSubtitle}>{selectedTutorial?.subtitle}</Text>

            <ScrollView style={styles.modalStepsScroll} showsVerticalScrollIndicator={false}>
              {selectedTutorial?.steps.map((step, idx) => (
                <View key={idx} style={styles.modalStepRow}>
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.gotItButton} activeOpacity={0.85} onPress={() => setSelectedTutorial(null)}>
              <Text style={styles.gotItButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <HealthAssessmentModal visible={showHealthModal} onClose={() => setShowHealthModal(false)} />

      <DeformityScannerModal
        visible={isDeformityScannerVisible}
        onClose={() => setIsDeformityScannerVisible(false)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  feedScrollView: { flex: 1, backgroundColor: colors.bg },
  feedScrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 150 },

  // Calendar + streak
  calendarCard: { backgroundColor: cardThemes.navy.bg, borderRadius: radius.xl, padding: 20, marginBottom: 18 },
  calendarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  calendarMonthText: { color: cardThemes.navy.text, fontSize: 17, fontWeight: '900' },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: cardThemes.navy.chip, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  streakChipLit: { backgroundColor: 'rgba(226, 88, 34, 0.9)' },
  streakChipText: { color: cardThemes.navy.text, fontSize: 11.5, fontWeight: '900' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayItem: { alignItems: 'center', width: 38 },
  dayLetter: { color: cardThemes.navy.sub, fontSize: 11, fontWeight: '800', marginBottom: 8 },
  dayLetterActive: { color: cardThemes.navy.text },
  dateCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dateCircleToday: { borderWidth: 2, borderColor: colors.flame },
  dateCircleSelected: { backgroundColor: colors.flame },
  dateNumber: { color: cardThemes.navy.text, fontSize: 13.5, fontWeight: '700' },
  dateNumberSelected: { color: colors.text, fontWeight: '900' },
  dayMarker: { height: 14, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  streakMessage: { color: cardThemes.navy.sub, fontSize: 12.5, fontWeight: '600', marginTop: 12, lineHeight: 18 },
  calendarCalorieRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0, 0, 0, 0.18)', borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16, marginTop: 16 },
  calendarCalorieLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  calFlameIconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.flame, alignItems: 'center', justifyContent: 'center' },
  calBurnNumberText: { color: cardThemes.navy.text, fontSize: 19, fontWeight: '900' },
  calBurnUnitText: { color: '#FFB38A', fontSize: 12, fontWeight: '800' },
  calBurnLabelText: { color: cardThemes.navy.sub, fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  calendarCalorieStatsRight: { flexDirection: 'row', gap: 8 },
  calMiniStatPill: { backgroundColor: cardThemes.navy.chip, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 50 },
  calMiniStatVal: { color: cardThemes.navy.text, fontSize: 13, fontWeight: '900' },
  calMiniStatLbl: { color: cardThemes.navy.sub, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  // Level strip
  levelStrip: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.xl, backgroundColor: cardThemes.lavender.bg, marginBottom: 26 },
  levelStripBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: cardThemes.lavender.chip, alignItems: 'center', justifyContent: 'center' },
  levelStripBadgeLabel: { color: cardThemes.lavender.sub, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  levelStripBadgeText: { color: cardThemes.lavender.text, fontSize: 20, fontWeight: '900', lineHeight: 22 },
  levelStripTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  levelStripTitle: { color: cardThemes.lavender.text, fontSize: 16, fontWeight: '900' },
  levelStripXp: { color: cardThemes.lavender.sub, fontSize: 11.5, fontWeight: '800' },
  levelTrack: { height: 10, borderRadius: 5, backgroundColor: cardThemes.lavender.track, overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: 5, backgroundColor: cardThemes.lavender.text },

  // Health question
  questionCard: { padding: 20, borderRadius: radius.xl, backgroundColor: cardThemes.pink.bg, marginBottom: 26 },
  questionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionTag: { backgroundColor: cardThemes.pink.chip, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  questionTagText: { color: cardThemes.pink.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  questionCounter: { color: cardThemes.pink.sub, fontSize: 11, fontWeight: '900' },
  questionPrompt: { color: cardThemes.pink.text, fontSize: 17, fontWeight: '900', lineHeight: 24, marginTop: 14 },
  questionHint: { color: cardThemes.pink.sub, fontSize: 12.5, marginTop: 6 },
  questionActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  yesBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  yesBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
  noBtn: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: cardThemes.pink.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  noBtnText: { color: cardThemes.pink.text, fontSize: 15, fontWeight: '900' },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 14 },
  headerLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionHeaderTitle: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  sectionSubHint: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
  onlineBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  pulseGreenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  onlineBadgeText: { color: colors.success, fontSize: 11, fontWeight: '900' },

  // Game modes
  arenaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.flame, borderRadius: radius.xl, padding: 22, marginBottom: 14, ...shadow(6) },
  modeTagRow: { flexDirection: 'row', gap: 6 },
  modeTag: { backgroundColor: 'rgba(17, 20, 26, 0.22)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  modeTagText: { color: colors.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  rewardTag: { backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  rewardTagText: { color: colors.textOnLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  arenaTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 10 },
  arenaSub: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, fontWeight: '600', marginTop: 4 },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.textOnLight,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 14,
  },
  playBtnText: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
  modeRow: { flexDirection: 'row', gap: 14, marginBottom: 28 },
  modeCard: { flex: 1, borderRadius: radius.xl, padding: 18, minHeight: 175 },
  modeIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(17, 20, 26, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitle: { color: colors.textOnLight, fontSize: 16, fontWeight: '900', marginTop: 14 },
  modeSub: { color: '#374151', fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  modeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 12,
  },
  modeFooterText: { color: colors.textOnLight, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },

  // AI coach
  tutorFlatListContent: { gap: 14, paddingBottom: 8, marginBottom: 26 },
  tutorCard: {
    width: 142,
    height: 142,
    borderRadius: radius.lg,
    padding: 12,
    justifyContent: 'space-between',
  },
  tutorTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tutorCategoryPill: { backgroundColor: 'rgba(17, 20, 26, 0.08)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tutorCategory: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  tutorDurationBadge: { backgroundColor: colors.text, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  tutorDuration: { color: colors.textOnLight, fontSize: 9, fontWeight: '900' },
  tutorIconWrap: { alignItems: 'center', justifyContent: 'center' },
  tutorBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 20, 26, 0.08)',
  },
  tutorTitle: { fontSize: 13, fontWeight: '900' },
  tutorSub: { fontSize: 9, fontWeight: '700', marginTop: 1 },
  tutorPlay: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.textOnLight, alignItems: 'center', justifyContent: 'center' },

  // Guides
  guideRow: { gap: 14, paddingBottom: 8, marginBottom: 26 },
  guideCard: { width: 210, padding: 18, borderRadius: radius.xl },
  guideIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  guideTag: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8, marginTop: 14 },
  guideTitle: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  guideDesc: { fontSize: 12, lineHeight: 17, marginTop: 6 },

  // Squad
  horizontalAvatarRow: { gap: 14, paddingBottom: 8, alignItems: 'flex-start' },
  avatarItem: { alignItems: 'center', width: 64 },
  avatarWrapper: { padding: 2, borderRadius: 32, borderWidth: 2, borderColor: colors.lavender },
  addFriendCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(226, 88, 34, 0.5)',
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
  },
  avatarLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 6 },
  squadEmpty: { justifyContent: 'center', height: 58, maxWidth: 220 },
  squadEmptyTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  squadEmptySub: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },

  // Tutorial modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 8, 14, 0.82)', justifyContent: 'flex-end' },
  tutorialModalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 22,
    paddingBottom: 32,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalBadgePill: { backgroundColor: 'rgba(226, 88, 34, 0.15)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  modalBadgeText: { color: colors.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
  modalCloseBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 14 },
  modalSubtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  modalStepsScroll: { marginTop: 16 },
  modalStepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  stepNumberBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: colors.onAccent, fontSize: 13, fontWeight: '900' },
  stepTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  stepDesc: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  gotItButton: { marginTop: 10, height: 52, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  gotItButtonText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
});
