import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  ArrowLeft,
  Award,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  Check,
  Cpu,
  Dumbbell,
  Equal,
  Flame,
  Gamepad2,
  Info,
  Lock,
  Medal,
  Palette,
  Play,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Video,
  X,
  Zap,
} from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { useUserStore } from '../store/userStore';
import { TierIcon } from '../components/TierIcon';
import { cardCycle, cardThemes, colors, radius } from '../theme';
import {
  calculateLevel,
  LEVEL_TIERS,
  fetchExerciseLeaderboard,
  fetchUserExerciseStats,
  ExerciseLeaderboardEntry,
  LevelInfo,
  UserExerciseStats,
} from '../utils/rankingService';
import { fetchFriends, FriendshipItem } from '../utils/friendService';
import {
  sendCustomBattleInvite,
  initBattleChannel,
  BattleMode,
  BattleInvite,
} from '../utils/customBattleService';

export interface ExerciseItem {
  id: string;
  name: string;
  category: 'all' | 'strength' | 'cardio' | 'flexibility';
  icon: string;
  description?: string;
  isFavorite?: boolean;
  bgGradient?: string;
  image_url?: string;
  type?: string;
  cure_to?: string[];
}

type IconType = React.ComponentType<{ size?: number; color?: string; style?: any; fill?: string }>;

interface QueueMode {
  id: string;
  title: string;
  description: string;
  Icon: IconType;
  tint: string;
  badge: string;
  kind: 'tutor' | 'solo' | 'ai_duel' | 'queue' | 'friend';
}

interface ExerciseDetailScreenProps {
  exercise: ExerciseItem;
  detailTab: 'workouts' | 'shop' | 'leaderboard' | 'how_to_play';
  onBack: () => void;
  onJoinQueue: (exercise: ExerciseItem, queue: 'faceoff' | 'quick_start' | 'ffa') => void;
  onDetailTabChange: (tab: 'workouts' | 'shop' | 'leaderboard' | 'how_to_play') => void;
  onStartCustomMatch?: (
    opponent: string,
    mode: 'faceoff' | 'quickjoin' | 'ffa',
    exerciseId: string,
    customRoomId?: string
  ) => void;
  onOpenCamera?: (exerciseId?: string, exerciseName?: string, isTutor?: boolean) => void;
  onSettingsPress?: () => void;
  onOpenAiDuel?: (exerciseId?: string) => void;
}

export const ExerciseDetailScreen: React.FC<ExerciseDetailScreenProps> = ({
  exercise,
  detailTab,
  onBack,
  onJoinQueue,
  onDetailTabChange,
  onStartCustomMatch,
  onOpenCamera,
  onSettingsPress,
  onOpenAiDuel,
}) => {
  const { profile, user, refreshProfile, isGuest } = useUserStore();
  const [exerciseStats, setExerciseStats] = useState<UserExerciseStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<ExerciseLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Custom Challenge State & Modals
  const [showFriendChallengeModal, setShowFriendChallengeModal] = useState<boolean>(false);
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedBattleMode, setSelectedBattleMode] = useState<BattleMode>('faceoff');
  const [customUsername, setCustomUsername] = useState<string>('');
  const [challengingFriendId, setChallengingFriendId] = useState<string | null>(null);
  const [activeSentInvite, setActiveSentInvite] = useState<BattleInvite | null>(null);
  const [inviteTimeoutSeconds, setInviteTimeoutSeconds] = useState<number>(30);
  const inviteTimerRef = useRef<any>(null);

  // Exercise-specific points and match counters
  const exercisePoints = exerciseStats?.points ?? 0;
  const exerciseMatchesPlayed = exerciseStats?.matches_played ?? 0;
  const exerciseMatchesWon = exerciseStats?.matches_won ?? 0;
  const exerciseReps = exerciseStats?.reps_completed ?? 0;
  const levelInfo: LevelInfo = calculateLevel(exercisePoints, exercise.name);

  const winRate =
    exerciseMatchesPlayed > 0
      ? Math.round((exerciseMatchesWon / exerciseMatchesPlayed) * 100)
      : 0;

  const loadExerciseData = useCallback(async () => {
    if (user?.id) {
      try {
        const stats = await fetchUserExerciseStats(user.id, exercise.id);
        setExerciseStats(stats);
      } catch (e) {
        console.warn('Failed to load user exercise stats:', e);
      }
    }
  }, [user?.id, exercise.id]);

  const loadLeaderboardData = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const data = await fetchExerciseLeaderboard(exercise.id, 50);
      setLeaderboard(data);
    } catch (e) {
      console.warn('Failed to load exercise leaderboard:', e);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [exercise.id]);

  const loadFriendsList = useCallback(async () => {
    if (!user?.id) return;
    setLoadingFriends(true);
    try {
      const list = await fetchFriends(user.id);
      setFriends(list);
    } catch (e) {
      console.warn('Failed to load friends:', e);
    } finally {
      setLoadingFriends(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadExerciseData();
    loadFriendsList();
  }, [loadExerciseData, loadFriendsList]);

  useEffect(() => {
    if (detailTab === 'leaderboard') {
      loadLeaderboardData();
    }
  }, [detailTab, loadLeaderboardData]);

  // Subscribe to responses for outgoing challenge invites
  useEffect(() => {
    if (!user?.id) return;

    const cleanup = initBattleChannel(
      user.id,
      undefined,
      (response) => {
        if (activeSentInvite && response.inviteId === activeSentInvite.id) {
          clearInterval(inviteTimerRef.current);
          if (response.accepted) {
            setActiveSentInvite(null);
            setShowFriendChallengeModal(false);
            if (onStartCustomMatch) {
              onStartCustomMatch(
                response.opponentUsername || activeSentInvite.receiverUsername,
                activeSentInvite.mode,
                exercise.id,
                response.matchRoomId || activeSentInvite.matchRoomId
              );
            } else {
              onJoinQueue(
                exercise,
                activeSentInvite.mode === 'faceoff' ? 'faceoff' : 'quick_start'
              );
            }
          } else {
            setActiveSentInvite(null);
            Alert.alert('Duel Declined', `@${activeSentInvite.receiverUsername} declined your battle invitation.`);
          }
        }
      }
    );

    return () => {
      cleanup();
      clearInterval(inviteTimerRef.current);
    };
  }, [user?.id, activeSentInvite, exercise, onStartCustomMatch, onJoinQueue]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshProfile(),
        loadExerciseData(),
        loadLeaderboardData(),
        loadFriendsList(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleChallengeFriend = async (targetFriend: { id: string; username: string }) => {
    if (!user?.id) return;
    const currentUsername =
      profile?.username || user.user_metadata?.username || user.email?.split('@')[0] || 'Athlete';

    setChallengingFriendId(targetFriend.id);
    try {
      const invite = await sendCustomBattleInvite(
        {
          id: user.id,
          username: currentUsername,
          avatar_config: profile?.avatar_config,
        },
        {
          id: targetFriend.id,
          username: targetFriend.username,
        },
        exercise.id,
        exercise.name,
        selectedBattleMode
      );

      setActiveSentInvite(invite);
      setInviteTimeoutSeconds(30);

      clearInterval(inviteTimerRef.current);
      inviteTimerRef.current = setInterval(() => {
        setInviteTimeoutSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(inviteTimerRef.current);
            setActiveSentInvite(null);
            Alert.alert('Invite Expired', `Battle challenge to @${targetFriend.username} timed out.`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e: any) {
      Alert.alert('Challenge Error', e?.message || 'Could not send battle challenge.');
    } finally {
      setChallengingFriendId(null);
    }
  };

  const handleChallengeByUsername = async () => {
    if (!customUsername.trim()) {
      Alert.alert('Missing Username', 'Please enter a valid athlete username to challenge.');
      return;
    }
    const targetUsername = customUsername.trim();

    const matchedFriend = friends.find(
      (f) => f.friend.username.toLowerCase() === targetUsername.toLowerCase()
    );

    if (matchedFriend) {
      handleChallengeFriend(matchedFriend.friend);
      setCustomUsername('');
      return;
    }

    handleChallengeFriend({
      id: `custom_${targetUsername}`,
      username: targetUsername,
    });
    setCustomUsername('');
  };

  const cancelOutgoingInvite = () => {
    clearInterval(inviteTimerRef.current);
    setActiveSentInvite(null);
  };

  const [showRulesInfoModal, setShowRulesInfoModal] = useState<boolean>(false);

  const isSquat = exercise.id === '1' || exercise.name.toLowerCase().includes('squat');

  const DETAIL_TABS: {
    key: ExerciseDetailScreenProps['detailTab'];
    label: string;
    Icon: IconType;
    requiresAuth: boolean;
  }[] = [
    { key: 'workouts', label: 'Play', Icon: Gamepad2, requiresAuth: false },
    { key: 'leaderboard', label: 'Ranks', Icon: Trophy, requiresAuth: true },
    { key: 'how_to_play', label: 'Rules', Icon: BookOpen, requiresAuth: false },
    { key: 'shop', label: 'Shop', Icon: ShoppingBag, requiresAuth: true },
  ];

  const TRAIN_MODES: QueueMode[] = [
    { id: 'ai_tutor', title: 'AI Tutor', description: 'Real-time pose guidance & correction', Icon: Bot, tint: colors.lavender, badge: 'COACH', kind: 'tutor' },
    { id: 'solo_practice', title: 'Solo Practice', description: 'AI form tracking & rep counting', Icon: Camera, tint: colors.sky, badge: 'SOLO', kind: 'solo' },
  ];

  const COMPETE_MODES: QueueMode[] = [
    { id: 'ai_duel', title: 'AI Duel', description: '1v1 match against an AI pacer', Icon: Cpu, tint: colors.accent, badge: 'VS AI', kind: 'ai_duel' },
    { id: 'ffa', title: 'Battle Ground', description: '10-player live leaderboard match', Icon: Trophy, tint: colors.gold, badge: '10 PLAYERS', kind: 'queue' },
    { id: 'faceoff', title: 'Faceoff', description: '1v1 split-screen video duel', Icon: Video, tint: colors.pink, badge: '1V1 VIDEO', kind: 'queue' },
    { id: 'quick_start', title: 'Quick Duel', description: '1v1 fast score battle', Icon: Zap, tint: colors.success, badge: '1V1 SCORE', kind: 'queue' },
    { id: 'custom_friend', title: 'Friend Battle', description: 'Challenge a friend directly', Icon: Users, tint: colors.lavender, badge: 'INVITE', kind: 'friend' },
  ];

  const handleModePress = (mode: QueueMode, locked: boolean, aiLocked: boolean) => {
    if (aiLocked) {
      Alert.alert('Squats Only', 'AI Duel is currently supported only for Squats. Other exercises will be unlocked soon!', [{ text: 'OK' }]);
      return;
    }
    if (locked) {
      Alert.alert('Account Required', 'Sign in or create an athlete account to battle live players in online duels.', [{ text: 'OK' }]);
      return;
    }
    switch (mode.kind) {
      case 'ai_duel':
        onOpenAiDuel?.('1');
        break;
      case 'tutor':
        onOpenCamera?.(exercise.id, exercise.name, true);
        break;
      case 'solo':
        onOpenCamera?.(exercise.id, exercise.name, false);
        break;
      case 'friend':
        setShowFriendChallengeModal(true);
        loadFriendsList();
        break;
      default:
        onJoinQueue(exercise, mode.id as 'faceoff' | 'quick_start' | 'ffa');
    }
  };

  const renderModeRow = (mode: QueueMode, index: number) => {
    const aiLocked = mode.kind === 'ai_duel' && !isSquat;
    const isOnline = mode.kind === 'queue' || mode.kind === 'friend';
    const locked = (isGuest && isOnline) || aiLocked;
    const { Icon } = mode;
    // Colored cards in the same rhythm as the Train screen's workout cards.
    const theme = cardCycle[index % cardCycle.length];

    return (
      <TouchableOpacity
        key={mode.id}
        style={[styles.modeRow, { backgroundColor: theme.bg }, locked && { opacity: 0.6 }]}
        activeOpacity={0.88}
        onPress={() => handleModePress(mode, locked, aiLocked)}
      >
        <View style={[styles.modeIconTile, { backgroundColor: theme.chip }]}>
          <Icon size={22} color={theme.text} />
        </View>

        <View style={styles.modeInfo}>
          <Text style={[styles.modeTitle, { color: theme.text }]} numberOfLines={1}>{mode.title}</Text>
          <Text style={[styles.modeDesc, { color: theme.sub }]} numberOfLines={1}>{mode.description}</Text>
          <View style={[styles.modeBadge, { backgroundColor: theme.chip }]}>
            {locked && <Lock size={9} color={theme.text} />}
            <Text style={[styles.modeBadgeText, { color: theme.text }]}>
              {aiLocked ? 'SQUATS ONLY' : locked ? 'LOCKED' : mode.badge}
            </Text>
          </View>
        </View>

        <View style={[styles.modeAction, { backgroundColor: theme.onDark ? '#FFFFFF' : '#11141A' }]}>
          {locked ? (
            <Lock size={15} color={theme.onDark ? '#11141A' : '#FFFFFF'} />
          ) : (
            <Play size={15} color={theme.onDark ? '#11141A' : '#FFFFFF'} fill={theme.onDark ? '#11141A' : '#FFFFFF'} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const SectionLabel = ({ Icon, title, first }: { Icon: IconType; title: string; first?: boolean }) => (
    <View style={[styles.sectionLabelRow, { marginTop: first ? 0 : 26 }]}>
      <Icon size={14} color={colors.accent} />
      <Text style={styles.sectionLabel}>{title}</Text>
    </View>
  );

  const PODIUM_COLORS = ['#F59E0B', '#C0C0C0', '#CD7F32'];

  const RuleRow = ({ Icon, tint, points, text, onCard }: { Icon: IconType; tint: string; points: string; text: string; onCard?: boolean }) => (
    <View style={styles.ruleRow}>
      <View style={[styles.ruleIcon, { backgroundColor: `${tint}22` }]}>
        <Icon size={15} color={tint} />
      </View>
      <Text style={[styles.ruleText, onCard && { color: cardThemes.pink.text }]}>{text}</Text>
      <Text style={[styles.rulePoints, { color: tint }]}>{points}</Text>
    </View>
  );

  const scoringRules = (
    <>
      <RuleRow Icon={TrendingUp} tint={colors.success} points="+10" text={`Win a ${exercise.name} duel`} />
      <RuleRow Icon={Equal} tint={colors.gold} points="+5" text="Draw: both players earn points" />
      <RuleRow Icon={TrendingDown} tint={colors.danger} points="-10" text="Defeat (never drops below 0)" />
    </>
  );

  const calorieInfo = (() => {
    switch (exercise.id) {
      case '7':
        return { perRep: '0.45', met: '8.0', formula: 'High upper-body & core compound effort burns ~0.45 kcal per rep.', technique: 'Elbows bend to <= 105° in straight plank and push to full lockout.' };
      case '4':
        return { perRep: '0.38', met: '6.0', formula: 'Unilateral leg & core engagement burns ~0.38 kcal per step/rep.', technique: 'Front knee drops to 90° and back knee nears the ground.' };
      case '2':
      case '5':
        return { perRep: '0.30', met: '4.5', formula: 'Continuous abdominal contractions burn ~0.30 kcal per rep.', technique: 'Shoulder blades lift fully off the floor into crunch lockout.' };
      case '3':
      case '6':
      case '8':
        return { perRep: '0.35', met: '4.0', formula: 'Restorative spine decompression & deep hip holds burn ~0.35 kcal per hold milestone.', technique: 'Knees folded on mat with torso folded forward and arms reaching straight.' };
      case '1':
      default:
        return { perRep: '0.35', met: '5.5', formula: 'Large quadriceps & glute muscle engagement burns ~0.35 kcal per rep.', technique: 'Hip crease drops below knee level (< 90° angle) and returns upright.' };
    }
  })();

  return (
    <View style={styles.detailScreenContainer}>
      {/* TOP BAR */}
      <View style={styles.topNavBar}>
        <TouchableOpacity style={styles.navButtonCircle} activeOpacity={0.8} onPress={onBack}>
          <ArrowLeft size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topNavTitle} numberOfLines={1}>{exercise.name}</Text>
        <TouchableOpacity style={styles.navButtonCircle} activeOpacity={0.8} onPress={() => setShowRulesInfoModal(true)}>
          <Info size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* HERO */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconTile}>
            <ExerciseIcon imageUrl={exercise.image_url} icon={exercise.icon} size={52} fontSize={30} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={styles.tierRow}>
              <View style={[styles.tierChip, { backgroundColor: `${levelInfo.color}22`, borderColor: `${levelInfo.color}66` }]}>
                <TierIcon level={levelInfo.level} size={12} color={levelInfo.color} />
                <Text style={[styles.tierChipText, { color: levelInfo.color }]}>{levelInfo.tier.toUpperCase()}</Text>
              </View>
              <Text style={styles.heroLevelText}>LVL {levelInfo.level}</Text>
            </View>
            <Text style={styles.heroTitle}>{levelInfo.title}</Text>
            <Text style={styles.heroPoints}>
              <Text style={styles.heroPointsNum}>{exercisePoints}</Text> points
            </Text>
          </View>
        </View>

        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Mastery {levelInfo.progressPercent}%</Text>
          <Text style={styles.progressSubLabel}>
            {levelInfo.level < 6 ? `${levelInfo.pointsToNext || 90} pts to LVL ${levelInfo.level + 1}` : 'Max level reached'}
          </Text>
        </View>
        <View style={styles.rankProgressTrack}>
          <View style={[styles.rankProgressFill, { width: `${Math.min(100, Math.max(2, levelInfo.progressPercent))}%` }]} />
        </View>

        <View style={styles.statGrid}>
          {[
            { label: 'MATCHES', value: exerciseMatchesPlayed, Icon: Swords },
            { label: 'WINS', value: exerciseMatchesWon, Icon: Trophy },
            { label: 'WIN RATE', value: `${winRate}%`, Icon: Target },
            { label: 'REPS', value: exerciseReps, Icon: Activity },
          ].map(({ label, value, Icon }) => (
            <View key={label} style={styles.statTile}>
              <Icon size={13} color={colors.accent} />
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* TABS */}
      <View style={styles.tabBar}>
        {DETAIL_TABS.map(({ key, label, Icon, requiresAuth }) => {
          const active = detailTab === key;
          const locked = isGuest && requiresAuth;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.tabItem, active && styles.tabItemActive]}
              activeOpacity={0.85}
              onPress={() => {
                if (locked) {
                  Alert.alert(
                    `${label} Locked`,
                    key === 'leaderboard'
                      ? 'Sign in or create an account to view global rankings and record your scores.'
                      : 'Sign in to customize athlete gear and items.',
                    [{ text: 'OK' }]
                  );
                  return;
                }
                onDetailTabChange(key);
              }}
            >
              {locked ? (
                <Lock size={13} color={colors.textDim} />
              ) : (
                <Icon size={14} color={active ? colors.onAccent : colors.textMuted} />
              )}
              <Text style={[styles.tabText, active && styles.tabTextActive, locked && { color: colors.textDim }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.detailScrollView}
        contentContainerStyle={styles.detailScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {detailTab === 'workouts' ? (
          <>
            <SectionLabel Icon={Dumbbell} title="TRAIN" first />
            {TRAIN_MODES.map((m, i) => renderModeRow(m, i))}
            <SectionLabel Icon={Swords} title="COMPETE" />
            {COMPETE_MODES.map((m, i) => renderModeRow(m, i + TRAIN_MODES.length))}
          </>
        ) : detailTab === 'leaderboard' ? (
          <View>
            <View style={styles.myRankCard}>
              <Avatar
                username={profile?.username || user?.email || 'user'}
                size={46}
                config={profile?.avatar_config}
                avatarUrl={profile?.avatar_url}
              />
              <View style={styles.myRankInfo}>
                <Text style={styles.myRankName} numberOfLines={1}>
                  {profile?.full_name || profile?.username || 'You'}
                </Text>
                <View style={styles.inlineRow}>
                  <TierIcon level={levelInfo.level} size={12} color={levelInfo.color} />
                  <Text style={styles.myRankTier}>LVL {levelInfo.level} · {levelInfo.title}</Text>
                </View>
              </View>
              <View style={styles.myRankRight}>
                <Text style={styles.myRankPoints}>{exercisePoints}</Text>
                <Text style={styles.myRankSub}>{exerciseMatchesWon}W / {exerciseMatchesPlayed}P</Text>
              </View>
            </View>

            <View style={styles.standingsHeaderRow}>
              <View style={styles.sectionLabelRow}>
                <Trophy size={14} color={colors.accent} />
                <Text style={styles.sectionLabel}>{exercise.name.toUpperCase()} STANDINGS</Text>
              </View>
              <TouchableOpacity style={styles.refreshBtn} activeOpacity={0.7} onPress={loadLeaderboardData}>
                <RefreshCw size={13} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {loadingLeaderboard ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.centerBoxText}>Loading {exercise.name} rankings...</Text>
              </View>
            ) : leaderboard.length === 0 ? (
              <View style={styles.centerBox}>
                <View style={styles.emptyIconCircle}>
                  <Trophy size={26} color={colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>No {exercise.name} rankings yet</Text>
                <Text style={styles.centerBoxText}>Be the first athlete to duel and claim rank #1.</Text>
              </View>
            ) : (
              leaderboard.map((entry, index) => {
                const entryLevel = calculateLevel(entry.points, exercise.name);
                const isMe = !!user?.id && entry.user_id === user.id;
                const podiumColor = PODIUM_COLORS[index];

                return (
                  <View
                    key={entry.user_id}
                    style={[
                      styles.leaderRow,
                      podiumColor && { borderColor: `${podiumColor}55` },
                      isMe && styles.leaderRowMe,
                    ]}
                  >
                    <View style={styles.rankBox}>
                      {podiumColor ? (
                        <View style={[styles.podiumCircle, { backgroundColor: `${podiumColor}22` }]}>
                          <Medal size={16} color={podiumColor} />
                        </View>
                      ) : (
                        <Text style={styles.rankNumberText}>#{index + 1}</Text>
                      )}
                    </View>
                    <Avatar username={entry.username} size={38} config={entry.avatar_config} avatarUrl={entry.avatar_url} />
                    <View style={styles.leaderNameBox}>
                      <Text style={[styles.leaderName, isMe && { color: colors.accent }]} numberOfLines={1}>
                        {entry.full_name || entry.username}{isMe ? ' (You)' : ''}
                      </Text>
                      <View style={styles.inlineRow}>
                        <TierIcon level={entryLevel.level} size={11} color={entryLevel.color} />
                        <Text style={styles.leaderSub}>
                          LVL {entryLevel.level} · {entry.matches_won}W · {entry.reps_completed} reps
                        </Text>
                      </View>
                    </View>
                    <View style={styles.leaderScoreBox}>
                      <Text style={styles.leaderScore}>{entry.points}</Text>
                      <Text style={styles.leaderScoreUnit}>PTS</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : detailTab === 'how_to_play' ? (
          <View>
            <View style={[styles.infoCard, { backgroundColor: cardThemes.sand.bg, borderWidth: 0 }]}>
              <View style={styles.sectionLabelRow}>
                <Flame size={14} color={cardThemes.sand.text} />
                <Text style={[styles.sectionLabel, { color: cardThemes.sand.text }]}>CALORIE COUNTING</Text>
              </View>
              <View style={styles.calPillRow}>
                <View style={[styles.calPill, { backgroundColor: cardThemes.sand.chip }]}>
                  <Text style={[styles.calPillVal, { color: colors.flame }]}>{calorieInfo.perRep}</Text>
                  <Text style={[styles.calPillSub, { color: cardThemes.sand.sub }]}>kcal per rep</Text>
                </View>
                <View style={[styles.calPill, { backgroundColor: cardThemes.sand.chip }]}>
                  <Text style={[styles.calPillVal, { color: colors.flame }]}>{calorieInfo.met}</Text>
                  <Text style={[styles.calPillSub, { color: cardThemes.sand.sub }]}>MET intensity</Text>
                </View>
              </View>
              {[
                { Icon: Flame, title: 'Calculation', text: calorieInfo.formula },
                { Icon: Check, title: 'Valid movement', text: calorieInfo.technique },
                { Icon: CalendarDays, title: 'Daily log', text: 'Saved automatically to your profile and home calendar.' },
              ].map(({ Icon, title, text }) => (
                <View key={title} style={styles.bulletRow}>
                  <Icon size={14} color={cardThemes.sand.sub} style={{ marginTop: 2 }} />
                  <Text style={[styles.bulletText, { color: cardThemes.sand.sub }]}>
                    <Text style={[styles.bulletBold, { color: cardThemes.sand.text }]}>{title}: </Text>
                    {text}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.infoCard, { backgroundColor: cardThemes.pink.bg, borderWidth: 0 }]}>
              <View style={styles.sectionLabelRow}>
                <Zap size={14} color={cardThemes.pink.text} />
                <Text style={[styles.sectionLabel, { color: cardThemes.pink.text }]}>MATCH SCORING</Text>
              </View>
              <RuleRow Icon={TrendingUp} tint="#047857" points="+10" text={`Win a ${exercise.name} duel`} onCard />
              <RuleRow Icon={Equal} tint="#B45309" points="+5" text="Draw: both players earn points" onCard />
              <RuleRow Icon={TrendingDown} tint="#B91C1C" points="-10" text="Defeat (never drops below 0)" onCard />
            </View>

            <View style={styles.infoCard}>
              <View style={styles.sectionLabelRow}>
                <Award size={14} color={colors.accent} />
                <Text style={styles.sectionLabel}>LEVEL TIERS</Text>
              </View>
              <View style={styles.tierGrid}>
                {LEVEL_TIERS.map((tier) => {
                  const isCurrent = tier.level === levelInfo.level;
                  return (
                    <View
                      key={tier.level}
                      style={[styles.tierCard, isCurrent && { borderColor: tier.color, backgroundColor: `${tier.color}14` }]}
                    >
                      <View style={[styles.tierIconCircle, { backgroundColor: `${tier.color}22` }]}>
                        <TierIcon level={tier.level} size={16} color={tier.color} />
                      </View>
                      <Text style={styles.tierCardName}>{tier.title}</Text>
                      <Text style={styles.tierCardRange}>
                        {tier.level === 6 ? `${tier.minPoints.toLocaleString()}+ pts` : `${tier.minPoints}-${tier.maxPoints} pts`}
                      </Text>
                      {isCurrent && <Text style={[styles.tierCurrent, { color: tier.color }]}>YOU</Text>}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <View style={styles.shopIconCircle}>
              <Palette size={26} color={colors.accent} />
            </View>
            <Text style={styles.shopTitle}>Upgrades & Avatars</Text>
            <Text style={styles.shopBody}>
              Unlock custom avatar themes and special battle trails as you climb the {exercise.name} mastery tiers.
            </Text>
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonText}>COMING SOON</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* RULES INFO MODAL */}
      <Modal visible={showRulesInfoModal} transparent animationType="fade" onRequestClose={() => setShowRulesInfoModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.sectionLabelRow}>
                <Info size={16} color={colors.accent} />
                <Text style={styles.modalTitle}>{exercise.name} scoring</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowRulesInfoModal(false)}>
                <X size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalCalorieBox}>
              <View style={styles.inlineRow}>
                <Flame size={14} color={colors.accent} />
                <Text style={styles.modalCalorieTitle}>
                  ~{calorieInfo.perRep} kcal per rep · {calorieInfo.met} METs
                </Text>
              </View>
              <Text style={styles.modalCalorieNote}>
                Burned calories are saved to your profile and home calendar by date.
              </Text>
            </View>

            {scoringRules}

            <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => setShowRulesInfoModal(false)}>
              <Text style={styles.primaryBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FRIEND CHALLENGE MODAL */}
      <Modal
        visible={showFriendChallengeModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!activeSentInvite) setShowFriendChallengeModal(false);
        }}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'flex-end', padding: 0 }]}>
          <View style={styles.sheetCard}>
            <View style={styles.modalHeader}>
              <View style={[styles.sectionLabelRow, { flex: 1 }]}>
                <Swords size={16} color={colors.accent} />
                <Text style={styles.modalTitle} numberOfLines={1}>Challenge a friend</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  cancelOutgoingInvite();
                  setShowFriendChallengeModal(false);
                }}
              >
                <X size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {activeSentInvite ? (
              <View style={styles.waitingBox}>
                <View style={styles.waitingIconCircle}>
                  <Swords size={30} color={colors.onAccent} />
                </View>
                <Text style={styles.waitingTitle}>Challenge sent!</Text>
                <Text style={styles.waitingDesc}>
                  Invited <Text style={{ color: colors.accent, fontWeight: '900' }}>@{activeSentInvite.receiverUsername}</Text> to a 1v1{' '}
                  {exercise.name} {activeSentInvite.mode === 'faceoff' ? 'Faceoff' : 'Score Duel'}.
                </Text>
                <View style={styles.waitingTimer}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.waitingTimerText}>Waiting for response ({inviteTimeoutSeconds}s)</Text>
                </View>
                <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={cancelOutgoingInvite}>
                  <Text style={styles.secondaryBtnText}>Cancel invitation</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.modeToggleRow}>
                  {([
                    { key: 'faceoff' as const, label: 'Faceoff (Camera)', Icon: Video },
                    { key: 'quickjoin' as const, label: 'Score Duel', Icon: Zap },
                  ]).map(({ key, label, Icon }) => {
                    const active = selectedBattleMode === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.modeToggleBtn, active && styles.modeToggleBtnActive]}
                        activeOpacity={0.8}
                        onPress={() => setSelectedBattleMode(key)}
                      >
                        <Icon size={14} color={active ? colors.onAccent : colors.textMuted} />
                        <Text style={[styles.modeToggleText, active && { color: colors.onAccent }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.directChallengeRow}>
                  <View style={styles.directInputWrap}>
                    <Search size={14} color={colors.textDim} />
                    <TextInput
                      style={styles.directInput}
                      placeholder="Challenge by @username..."
                      placeholderTextColor={colors.textDim}
                      value={customUsername}
                      onChangeText={setCustomUsername}
                      autoCapitalize="none"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.directSendBtn, !customUsername.trim() && { opacity: 0.5 }]}
                    activeOpacity={0.85}
                    onPress={handleChallengeByUsername}
                    disabled={!customUsername.trim()}
                  >
                    <Send size={15} color={colors.onAccent} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.friendsSubHeader}>YOUR FRIENDS ({friends.length})</Text>

                <ScrollView style={styles.friendsScroll} showsVerticalScrollIndicator={false}>
                  {loadingFriends ? (
                    <View style={styles.centerBox}>
                      <ActivityIndicator size="small" color={colors.accent} />
                      <Text style={styles.centerBoxText}>Loading friends...</Text>
                    </View>
                  ) : friends.length === 0 ? (
                    <View style={styles.centerBox}>
                      <Users size={26} color={colors.textDim} />
                      <Text style={styles.emptyTitle}>No friends added yet</Text>
                      <Text style={styles.centerBoxText}>Add friends in your Profile tab to send instant 1v1 invites.</Text>
                    </View>
                  ) : (
                    friends.map((item) => {
                      const isChallengingThis = challengingFriendId === item.friend.id;
                      return (
                        <View key={item.friendship_id} style={styles.friendRow}>
                          <Avatar
                            username={item.friend.username}
                            size={40}
                            config={item.friend.avatar_config}
                            avatarUrl={item.friend.avatar_url}
                          />
                          <View style={styles.friendInfo}>
                            <Text style={styles.friendName} numberOfLines={1}>
                              {item.friend.full_name || item.friend.username}
                            </Text>
                            <Text style={styles.friendUsername}>@{item.friend.username}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.challengeBtn}
                            activeOpacity={0.85}
                            onPress={() => handleChallengeFriend(item.friend)}
                            disabled={isChallengingThis}
                          >
                            {isChallengingThis ? (
                              <ActivityIndicator size="small" color={colors.onAccent} />
                            ) : (
                              <>
                                <Swords size={12} color={colors.onAccent} />
                                <Text style={styles.challengeBtnText}>Challenge</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  detailScreenContainer: { flex: 1, backgroundColor: colors.bg },

  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  navButtonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topNavTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '900', marginHorizontal: 12 },

  // Hero
  heroCard: { marginHorizontal: 18, padding: 20, borderRadius: radius.xl, backgroundColor: cardThemes.navy.bg },
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  heroIconTile: { width: 76, height: 76, borderRadius: 22, backgroundColor: 'rgba(255, 255, 255, 0.14)', alignItems: 'center', justifyContent: 'center' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  tierChipText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
  heroLevelText: { color: cardThemes.navy.sub, fontSize: 11, fontWeight: '900' },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 },
  heroPoints: { color: cardThemes.navy.sub, fontSize: 12.5, fontWeight: '700', marginTop: 2 },
  heroPointsNum: { color: '#FFB38A', fontWeight: '900', fontSize: 15 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  progressLabel: { color: colors.text, fontSize: 11.5, fontWeight: '800' },
  progressSubLabel: { color: cardThemes.navy.sub, fontSize: 11, fontWeight: '700' },
  rankProgressTrack: { height: 9, borderRadius: 5, backgroundColor: 'rgba(0, 0, 0, 0.25)', overflow: 'hidden' },
  rankProgressFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  statLabel: { color: cardThemes.navy.sub, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6, marginTop: 2 },

  // Tabs
  tabBar: { flexDirection: 'row', marginHorizontal: 18, marginTop: 18, padding: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabItem: { flex: 1, height: 38, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabItemActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: colors.onAccent },

  detailScrollView: { flex: 1 },
  detailScrollContent: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 140 },

  // Mode list
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionLabel: { color: colors.text, fontSize: 12.5, fontWeight: '900', letterSpacing: 0.8 },
  modeRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, marginTop: 14 },
  modeIconTile: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeInfo: { flex: 1, marginHorizontal: 14 },
  modeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeTitle: { fontSize: 16, fontWeight: '900' },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, marginTop: 8 },
  modeBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  modeDesc: { fontSize: 12, marginTop: 3 },
  modeAction: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  modeActionLocked: { backgroundColor: colors.surfaceHi },

  // Leaderboard
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  myRankCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, backgroundColor: colors.flame },
  myRankInfo: { flex: 1, marginLeft: 12 },
  myRankName: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 3 },
  myRankTier: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: '700' },
  myRankRight: { alignItems: 'flex-end' },
  myRankPoints: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  myRankSub: { color: 'rgba(255,255,255,0.85)', fontSize: 10.5, fontWeight: '700' },
  standingsHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 4 },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 10 },
  leaderRowMe: { borderColor: colors.accent },
  rankBox: { width: 36, alignItems: 'center', marginRight: 6 },
  podiumCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rankNumberText: { color: colors.textMuted, fontSize: 13, fontWeight: '900' },
  leaderNameBox: { flex: 1, marginLeft: 10 },
  leaderName: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  leaderSub: { color: colors.textMuted, fontSize: 11 },
  leaderScoreBox: { alignItems: 'flex-end', marginLeft: 8 },
  leaderScore: { color: colors.text, fontSize: 17, fontWeight: '900' },
  leaderScoreUnit: { color: colors.textDim, fontSize: 9, fontWeight: '900' },
  centerBox: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  centerBoxText: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(226, 88, 34, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },

  // Rules
  infoCard: { padding: 20, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  calPillRow: { flexDirection: 'row', gap: 12, marginTop: 14, marginBottom: 8 },
  calPill: {
    flex: 1,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(226, 88, 34, 0.1)',
    alignItems: 'center',
  },
  calPillVal: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  calPillSub: { color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 1 },
  bulletRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  bulletText: { flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  bulletBold: { color: colors.text, fontWeight: '800' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  ruleIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ruleText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600', marginLeft: 10 },
  rulePoints: { fontSize: 15, fontWeight: '900' },
  tierGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tierCard: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tierIconCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tierCardName: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: 6 },
  tierCardRange: { color: colors.textDim, fontSize: 10, fontWeight: '700', marginTop: 2 },
  tierCurrent: { fontSize: 8.5, fontWeight: '900', letterSpacing: 0.8, marginTop: 4 },

  // Shop
  shopIconCircle: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(226, 88, 34, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  shopBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  comingSoonPill: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
  },
  comingSoonText: { color: colors.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 8, 14, 0.82)', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCalorieBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(226, 88, 34, 0.1)',
  },
  modalCalorieTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  modalCalorieNote: { color: colors.textMuted, fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  primaryBtn: {
    marginTop: 18,
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: '900' },
  secondaryBtn: {
    marginTop: 18,
    height: 48,
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: colors.text, fontSize: 14, fontWeight: '800' },

  // Friend challenge
  waitingBox: { alignItems: 'center', paddingVertical: 16 },
  waitingIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 14 },
  waitingDesc: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },
  waitingTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
  },
  waitingTimerText: { color: colors.text, fontSize: 12.5, fontWeight: '700' },
  modeToggleRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  modeToggleBtn: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeToggleBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeToggleText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '800' },
  directChallengeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  directInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  directInput: { flex: 1, color: colors.text, fontSize: 14 },
  directSendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendsSubHeader: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 18, marginBottom: 4 },
  friendsScroll: { maxHeight: 320 },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  friendInfo: { flex: 1, marginLeft: 12 },
  friendName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  friendUsername: { color: colors.textMuted, fontSize: 11.5, marginTop: 1 },
  challengeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  challengeBtnText: { color: colors.onAccent, fontSize: 12, fontWeight: '900' },
});
