import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  useWindowDimensions,
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
import { colors, exerciseCardThemes, radius } from '../theme';

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

  const TUTORIAL_CARDS = [
    { tutorial: TUTORIALS[0], tag: 'AI TRACKER', title: 'How AI Tracking Works', Icon: Bot },
    { tutorial: TUTORIALS[1], tag: 'RULES', title: '1v1 Battle Scoring', Icon: Swords },
    { tutorial: TUTORIALS[2], tag: 'SETUP', title: 'Camera Positioning', Icon: Smartphone },
  ];

  const openArena = () => {
    if (isGuest) {
      Alert.alert(
        '1v1 Arena Locked',
        'Sign in or create a free athlete account to duel live players in real-time battles.',
        [{ text: 'OK' }]
      );
      return;
    }
    onExerciseSelect(activeExercise);
  };

  // Featured carousel (like the reference's big banner with page dots).
  const HERO_SLIDES = [
    {
      key: 'arena',
      tag: `RANKED · +${XP_PER_MATCH} XP`,
      title: `${activeExercise.name}\n1v1 Arena`,
      sub: 'Live camera battle. Most clean reps wins.',
      cta: isGuest ? 'Sign in to play' : 'Play now',
      CtaIcon: isGuest ? Lock : Play,
      visual: <ExerciseIcon imageUrl={activeExercise.image_url} icon={activeExercise.icon || '🏋️‍♂️'} size={110} fontSize={60} />,
      onPress: openArena,
    },
    {
      key: 'ai',
      tag: 'AI DUEL',
      title: 'Human\nvs AI',
      sub: 'Beat 4 bot levels in a 2-minute duel.',
      cta: 'Start duel',
      CtaIcon: Swords,
      visual: <Bot size={92} color="rgba(255,255,255,0.92)" strokeWidth={1.4} />,
      onPress: () => onOpenAiDuel?.(activeExercise.id),
    },
    {
      key: 'scan',
      tag: 'AI SCANNER',
      title: 'Posture\nScan',
      sub: 'Check knees, spine & shoulders in 3 seconds.',
      cta: 'Scan now',
      CtaIcon: Scan,
      visual: <Scan size={92} color="rgba(255,255,255,0.92)" strokeWidth={1.4} />,
      onPress: () => setIsDeformityScannerVisible(true),
    },
  ];

  const { width: windowWidth } = useWindowDimensions();
  const heroWidth = windowWidth - 36;
  const heroRef = useRef<ScrollView>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  // Gentle auto-advance; restarts whenever the user swipes.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = (heroIndex + 1) % HERO_SLIDES.length;
      heroRef.current?.scrollTo({ x: next * (heroWidth + 12), animated: true });
      setHeroIndex(next);
    }, 5000);
    return () => clearTimeout(t);
  }, [heroIndex, heroWidth, HERO_SLIDES.length]);

  const SectionHeader = ({
    title,
    actionLabel,
    onAction,
    right,
  }: {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    right?: React.ReactNode;
  }) => (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {right ??
        (actionLabel ? (
          <TouchableOpacity style={styles.seeAllBtn} onPress={onAction} activeOpacity={0.7}>
            <Text style={styles.seeAllText}>{actionLabel}</Text>
            <ChevronRight size={14} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null)}
    </View>
  );

  const tutorials = exercises.slice(0, 4);

  return (
    <ScrollView
      style={styles.feedScrollView}
      contentContainerStyle={styles.feedScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. FEATURED HERO CAROUSEL */}
      <ScrollView
        ref={heroRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={heroWidth + 12}
        decelerationRate="fast"
        contentContainerStyle={{ gap: 12 }}
        onMomentumScrollEnd={(e) => setHeroIndex(Math.round(e.nativeEvent.contentOffset.x / (heroWidth + 12)))}
      >
        {HERO_SLIDES.map(({ key, tag, title, sub, cta, CtaIcon, visual, onPress }) => (
          <TouchableOpacity key={key} style={[styles.heroCard, { width: heroWidth }]} activeOpacity={0.92} onPress={onPress}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTag}>{tag}</Text>
              <Text style={styles.heroTitle}>{title}</Text>
              <Text style={styles.heroSub} numberOfLines={2}>{sub}</Text>
              <View style={styles.heroCta}>
                <CtaIcon size={14} color={colors.flame} />
                <Text style={styles.heroCtaText}>{cta}</Text>
              </View>
            </View>
            <View style={styles.heroVisual}>{visual}</View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.dotsRow}>
        {HERO_SLIDES.map((s, i) => (
          <View key={s.key} style={[styles.dot, i === heroIndex && styles.dotActive]} />
        ))}
      </View>

      {/* 2. YOUR ACTIVITY */}
      <SectionHeader title="Your activity" actionLabel="Profile" onAction={() => onNavigateToTab?.('profile')} />

      <View style={styles.weekRow}>
        {currentWeekDays.map((item) => {
          const isSelected = selectedDateString === item.dateString;
          const active = isActiveDay(profile, item.dateString) || (item.isToday && streak.activeToday);
          return (
            <TouchableOpacity
              key={item.dateString}
              style={[styles.weekDay, isSelected && styles.weekDaySelected]}
              activeOpacity={0.8}
              onPress={() => setSelectedDateString(item.dateString)}
            >
              <Text style={[styles.weekLetter, isSelected && styles.weekTextSelected]}>{item.day}</Text>
              <Text style={[styles.weekDate, isSelected && styles.weekTextSelected]}>{item.date}</Text>
              <View style={[styles.weekDot, active && styles.weekDotActive, isSelected && active && { backgroundColor: '#FFFFFF' }]} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.activityGrid}>
        <View style={styles.activityCol}>
          <View style={styles.statTile}>
            <View style={styles.statIcon}>
              <Flame size={16} color={colors.flame} />
            </View>
            <Text style={styles.statLabel}>Energy burned</Text>
            <Text style={styles.statValue}>
              {dayCaloriesBurned} <Text style={styles.statUnit}>kcal</Text>
            </Text>
          </View>
          <View style={styles.statTile}>
            <View style={styles.statIcon}>
              <Activity size={16} color={colors.flame} />
            </View>
            <Text style={styles.statLabel}>Reps · Matches</Text>
            <Text style={styles.statValue}>
              {dayRepsCompleted} <Text style={styles.statUnit}>· {dayMatchesPlayed}</Text>
            </Text>
          </View>
        </View>

        <View style={styles.streakTile}>
          <View style={styles.statIcon}>
            <Flame size={16} color={colors.flame} fill={streak.activeToday ? colors.flame : 'transparent'} />
          </View>
          <Text style={styles.statLabel}>Day streak</Text>
          <Text style={styles.streakValue}>{streak.current}</Text>
          <View style={styles.streakFlames}>
            {currentWeekDays.map((d) => (
              <Flame
                key={d.dateString}
                size={12}
                color={isActiveDay(profile, d.dateString) || (d.isToday && streak.activeToday) ? colors.flame : colors.textDim}
                fill={isActiveDay(profile, d.dateString) || (d.isToday && streak.activeToday) ? colors.flame : 'transparent'}
              />
            ))}
          </View>
          <Text style={styles.streakHint} numberOfLines={2}>
            {streak.activeToday ? 'Streak secured today' : streak.atRisk ? 'Ends tonight - keep it alive' : 'Start one today'}
          </Text>
          <TouchableOpacity
            style={styles.streakBtn}
            activeOpacity={0.85}
            onPress={() => onOpenCamera(activeExercise.id, activeExercise.name, true)}
          >
            <Text style={styles.streakBtnText}>{streak.activeToday ? 'Train more' : 'Start now'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. LEVEL */}
      <TouchableOpacity style={styles.levelStrip} activeOpacity={0.85} onPress={() => onNavigateToTab?.('profile')}>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>LV {level.level}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.levelTopRow}>
            <Text style={styles.levelTitle}>{level.title}</Text>
            <Text style={styles.levelXp}>{level.xpForNextLevel - level.xpIntoLevel} XP to level {level.level + 1}</Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${Math.max(3, level.progress * 100)}%` }]} />
          </View>
        </View>
      </TouchableOpacity>

      {/* 4. DAILY QUESTS */}
      <DailyChallengesSection
        exercises={exercises}
        profile={profile}
        selectedDateString={selectedDateString}
        onOpenCamera={onOpenCamera}
        onExerciseSelect={onExerciseSelect}
      />

      {/* 5. BODY CHECK-IN */}
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
                <X size={18} color={colors.text} strokeWidth={2.5} />
                <Text style={styles.noBtnText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* 6. AI COACH GRID (two alternating colors) */}
      <SectionHeader
        title="AI coach"
        right={
          <View style={styles.onlineBadgePill}>
            <View style={styles.pulseGreenDot} />
            <Text style={styles.onlineBadgeText}>{onlineCount} online</Text>
          </View>
        }
      />
      <View style={styles.tutorGrid}>
        {tutorials.map((item, index) => {
          const theme = exerciseCardThemes[index % exerciseCardThemes.length];
          const duration = item.duration_mins || (index % 2 === 0 ? 32 : 25);
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.tutorCard, { backgroundColor: theme.bg }]}
              activeOpacity={0.88}
              onPress={() => onOpenCamera(item.id, item.name, true)}
            >
              <View style={styles.tutorTopRow}>
                <View style={[styles.tutorPill, { backgroundColor: theme.chip }]}>
                  <Text style={[styles.tutorPillText, { color: theme.text }]}>{item.category?.toUpperCase() || 'FITNESS'}</Text>
                </View>
                <View style={styles.tutorDuration}>
                  <Text style={styles.tutorDurationText}>{duration}m</Text>
                </View>
              </View>
              <View style={styles.tutorIconWrap}>
                <ExerciseIcon imageUrl={item.image_url} icon={item.icon} size={70} fontSize={40} />
              </View>
              <View style={styles.tutorBottomRow}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={[styles.tutorTitle, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.tutorSub, { color: theme.sub }]} numberOfLines={1}>Voice & pose</Text>
                </View>
                <View style={styles.tutorPlay}>
                  <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {exercises.length > 4 && (
        <TouchableOpacity style={styles.moreBtn} activeOpacity={0.8} onPress={() => onNavigateToTab?.('workouts')}>
          <Text style={styles.moreBtnText}>See all {exercises.length} exercises</Text>
          <ChevronRight size={15} color={colors.text} />
        </TouchableOpacity>
      )}
      <View style={{ height: 30 }} />

      {/* 7. GUIDES */}
      <SectionHeader title="Guides" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.guideRow}>
        {TUTORIAL_CARDS.map(({ tutorial, tag, title, Icon }) => (
          <TouchableOpacity
            key={tag}
            style={styles.guideCard}
            activeOpacity={0.88}
            onPress={() => setSelectedTutorial(tutorial)}
          >
            <View style={styles.guideIcon}>
              <Icon size={18} color={colors.flame} />
            </View>
            <Text style={styles.guideTag}>{tag}</Text>
            <Text style={styles.guideTitle}>{title}</Text>
            <Text style={styles.guideDesc} numberOfLines={2}>{tutorial.subtitle}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 8. SQUAD */}
      <SectionHeader title="Your squad" actionLabel={`${friends.length} friends`} onAction={() => onNavigateToTab?.('profile')} />
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

  // Hero carousel
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.flame,
    borderRadius: radius.xl,
    padding: 22,
    minHeight: 190,
  },
  heroTag: { color: 'rgba(255,255,255,0.8)', fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', lineHeight: 30, marginTop: 8 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, fontWeight: '600', lineHeight: 17, marginTop: 6 },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 16,
  },
  heroCtaText: { color: colors.flame, fontSize: 13, fontWeight: '900' },
  heroVisual: { width: 110, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 26 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHi },
  dotActive: { width: 18, backgroundColor: colors.flame },

  // Section headers
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionHeaderTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
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

  // Activity
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  weekDay: {
    width: 42,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekDaySelected: { backgroundColor: colors.flame, borderColor: colors.flame },
  weekLetter: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800' },
  weekDate: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 2 },
  weekTextSelected: { color: '#FFFFFF' },
  weekDot: { width: 5, height: 5, borderRadius: 3, marginTop: 5, backgroundColor: 'transparent' },
  weekDotActive: { backgroundColor: colors.flame },
  activityGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  activityCol: { flex: 1, gap: 12 },
  statTile: {
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(226, 88, 34, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700', marginTop: 10 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 2 },
  statUnit: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  streakTile: {
    flex: 1,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakValue: { color: colors.text, fontSize: 40, fontWeight: '900', lineHeight: 46, marginTop: 2 },
  streakFlames: { flexDirection: 'row', gap: 3, marginTop: 4 },
  streakHint: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  streakBtn: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.flame,
  },
  streakBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },

  // Level
  levelStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  levelBadge: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(226, 88, 34, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: { color: colors.flame, fontSize: 13, fontWeight: '900' },
  levelTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  levelTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  levelXp: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700' },
  levelTrack: { height: 9, borderRadius: 5, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  levelFill: { height: '100%', borderRadius: 5, backgroundColor: colors.flame },

  // Body check-in
  questionCard: {
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  questionTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  questionTag: { backgroundColor: 'rgba(226, 88, 34, 0.14)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  questionTagText: { color: colors.flame, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  questionCounter: { color: colors.textDim, fontSize: 11, fontWeight: '900' },
  questionPrompt: { color: colors.text, fontSize: 17, fontWeight: '900', lineHeight: 24, marginTop: 14 },
  questionHint: { color: colors.textMuted, fontSize: 12.5, marginTop: 6 },
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
  noBtn: {
    flex: 1,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  noBtnText: { color: colors.text, fontSize: 15, fontWeight: '900' },

  // AI coach grid
  tutorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tutorCard: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: radius.xl,
    padding: 14,
    minHeight: 200,
    justifyContent: 'space-between',
  },
  tutorTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tutorPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tutorPillText: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  tutorDuration: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  tutorDurationText: { color: colors.textOnLight, fontSize: 9.5, fontWeight: '900' },
  tutorIconWrap: { alignItems: 'center', justifyContent: 'center', marginVertical: 10 },
  tutorBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tutorTitle: { fontSize: 14.5, fontWeight: '900' },
  tutorSub: { fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  tutorPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.textOnLight, alignItems: 'center', justifyContent: 'center' },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreBtnText: { color: colors.text, fontSize: 13, fontWeight: '800' },

  // Guides
  guideRow: { gap: 12, paddingTop: 2, paddingBottom: 8, marginBottom: 20 },
  guideCard: {
    width: 210,
    padding: 18,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(226, 88, 34, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideTag: { color: colors.flame, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8, marginTop: 14 },
  guideTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  guideDesc: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 6 },

  // Squad
  horizontalAvatarRow: { gap: 14, paddingBottom: 8, alignItems: 'flex-start' },
  avatarItem: { alignItems: 'center', width: 64 },
  avatarWrapper: { padding: 2, borderRadius: 32, borderWidth: 2, borderColor: colors.flame },
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
