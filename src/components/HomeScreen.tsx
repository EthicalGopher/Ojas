import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import {
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Wrench } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ModelComplexity } from '../utils/deviceSpecs';
import { getDeviceInfo, getRecommendedModel } from '../utils/deviceSpecs';
import { usePack } from '../utils/assetPacks';
import { PACK_SIZES, formatProgress, isReady } from '../utils/assetPacksLogic';
import {
  connectMatchSocket,
  connectPresenceSocket,
  disconnectMatchSocket,
  disconnectPresenceSocket,
  fetchQueueCounts,
  searchQueueWithBotFallback,
} from '../utils/matchmaking';
import { useGameStats } from '../hooks/useGameStats';
import type { SimulatedOpponent } from '../utils/simulatedOpponent';
import { useMatchmakingStore } from '../store/matchmakingStore';
import { useUserStore } from '../store/userStore';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';
import { ExercisesScreen, ExerciseItem } from '../screens/ExercisesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { fetchExercisesFromSupabase } from '../utils/exerciseService';
import { HumanVsAIModal } from './HumanVsAIModal';
import { MatchMode } from '../features/match/components/MatchCameraScreen';
import { AIBotProfile } from '../utils/aiBotService';
import { NewsScreen } from '../screens/NewsScreen';
import { AvatarShopScreen } from '../features/avatar/components/AvatarShopScreen';
import { LevelUpCelebration } from './LevelUpCelebration';
import { useNewsStore } from '../store/newsStore';
import { makeStyles, radius, ThemeColors, useColors } from '../theme';
import { useExerciseListStore } from '../store/exerciseListStore';
import { LobbyScreen } from '../screens/LobbyScreen';
import { modeNeedsAuth, type LobbyMode } from '../screens/lobbyLogic';
import { GameTopBar, ScreenBackground } from './game';
import { GameSettingsModal } from './GameSettingsModal';
import type { SessionOrigin } from '../store/userStore';

import { ThemedStatusBar } from './ThemedStatusBar';
export type MainTab = 'home' | 'explore' | 'workouts' | 'shop' | 'social' | 'profile';

type DetailSubTab = 'workouts' | 'leaderboard' | 'how_to_play';
type ExerciseCategory = 'all' | 'strength' | 'cardio' | 'flexibility';

interface HomeScreenProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onOpenCamera: (exerciseId?: string, exerciseName?: string, isTutor?: boolean, origin?: SessionOrigin) => void;
  onOpenMatchCamera: (opponent: string, mode: MatchMode, exerciseId?: string, simulated?: SimulatedOpponent, origin?: SessionOrigin) => void;
  onEnterQueue: (title?: string, message?: string, badge?: string, subInfo?: string, isFFA?: boolean) => void;
  onUpdateQueueStatus?: (title?: string, message?: string, badge?: string, subInfo?: string, countdown?: number, playerCount?: number) => void;
  onCancelQueue: () => void;
  onShowAuthModal: () => void;
  currentUser: any;
  selectedModel: ModelComplexity;
  onSelectModel: (model: ModelComplexity) => void;
  onLogout?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  activeTab,
  onTabChange,
  onOpenCamera,
  onOpenMatchCamera,
  onEnterQueue,
  onUpdateQueueStatus,
  onCancelQueue,
  onShowAuthModal,
  currentUser,
  selectedModel,
  onSelectModel,
  onLogout,
}) => {
  const colors = useColors();
  const styles = useStyles();
  // The shared store is the only source of the exercise list (lobby, Feed, Train and quest checks agree).
  const exercisesList = useExerciseListStore((state) => state.exercises);
  const isGuest = useUserStore((state) => state.isGuest);
  const activeSubTab = useUserStore((state) => state.homeSubTab);
  const setActiveSubTab = useUserStore((state) => state.setHomeSubTab);
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>('all');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseItem | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<DetailSubTab>('workouts');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [deviceName, setDeviceName] = useState<string>('Mobile Device');
  const [totalRamGb, setTotalRamGb] = useState<number>(4.0);
  const [recommendedModel, setRecommendedModel] = useState<ModelComplexity>('medium');
  // The "high" pose model is a Play asset pack (fast-follow); it is only used once it has arrived.
  const heavyPack = usePack('pose_heavy');
  const onlineCount = useMatchmakingStore((state) => state.total_online);
  const queueCounts = useMatchmakingStore((state) => state.exercise_counts);
  const setCounts = useMatchmakingStore((state) => state.setCounts);

  const playerLevel = useGameStats().level.level;
  const initNews = useNewsStore((state) => state.init);

  useEffect(() => initNews(currentUser?.id ?? null), [currentUser?.id, initNews]);

  const selectedExerciseId = useUserStore((state) => state.selectedExerciseId);
  const setSelectedExerciseId = useUserStore((state) => state.setSelectedExerciseId);

  const loadExercises = useCallback(async () => {
    try {
      const data = await fetchExercisesFromSupabase();
      if (data && data.length > 0) {
        useExerciseListStore.getState().setExercises(data);
      }
    } catch (e) {
      console.warn('Failed to load exercises from Supabase:', e);
    }
  }, []);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  // When selectedExerciseId changes in store, set selectedExercise
  useEffect(() => {
    if (selectedExerciseId) {
      const found = exercisesList.find((ex) => ex.id === selectedExerciseId);
      if (found) {
        setSelectedExercise(found);
      }
    }
  }, [selectedExerciseId, exercisesList]);

  const prevActiveTab = useRef(activeTab);

  useEffect(() => {
    if (prevActiveTab.current !== activeTab) {
      prevActiveTab.current = activeTab;
      setSelectedExercise(null);
      setSelectedExerciseId(null);
    }
  }, [activeTab, setSelectedExerciseId]);

  useEffect(() => {
    try {
      const info = getDeviceInfo();
      setDeviceName(info.modelName);
      setTotalRamGb(info.totalMemoryGb);
      setRecommendedModel(getRecommendedModel(info.totalMemoryGb));
    } catch (e) {
      setDeviceName('Mobile Device');
      setRecommendedModel('medium');
    }
  }, []);

  useEffect(() => {
    const presenceUsername =
      currentUser?.user_metadata?.username ||
      currentUser?.email?.split('@')[0] ||
      currentUser?.user?.id ||
      currentUser?.id ||
      'athlete';

    connectPresenceSocket(presenceUsername);

    const refreshCounts = async () => {
      try {
        const data = await fetchQueueCounts();
        setCounts(data);
      } catch (e) {
        console.log('[Matchmaking] fetch counts failed:', (e as Error).message);
      }
    };

    refreshCounts();
    const interval = setInterval(refreshCounts, 3000);
    return () => {
      clearInterval(interval);
      disconnectPresenceSocket();
    };
  }, [currentUser, setCounts]);

  const handleJoinQueue = (exercise: ExerciseItem, queue: 'quick_start' | 'ffa', origin: SessionOrigin = 'detail') => {
    const userId =
      currentUser?.user_metadata?.username ||
      currentUser?.email ||
      currentUser?.user?.id ||
      currentUser?.id ||
      `Player_${Math.floor(1000 + Math.random() * 9000)}`;

    if (queue === 'ffa') {
      onEnterQueue(
        'BATTLE GROUND LOBBY',
        'Gathering athletes (Max 10). Match starts when the timer ends or the lobby fills...',
        'WAITING: 30s',
        '1 Athlete Joined',
        true
      );
    } else {
      onEnterQueue(
        'FINDING OPPONENT',
        'Finding a worthy rival...',
        undefined,
        undefined,
        false
      );
    }

    searchQueueWithBotFallback({
      userId,
      exerciseId: exercise.id,
      queue,
      playerLevel,
      onLobbyUpdate: (countdown, playerCount) =>
        onUpdateQueueStatus?.(
          'BATTLE GROUND LOBBY',
          `Match starts in ${countdown}s (or when 10 athletes join)...`,
          `STARTING IN ${countdown}s`,
          `${playerCount} ${playerCount === 1 ? 'Athlete' : 'Athletes'} in Lobby (Max 10)`,
          countdown,
          playerCount
        ),
      onResult: (outcome) => {
        if (outcome.kind === 'simulated') {
          onOpenMatchCamera(outcome.opponent.username, 'quickjoin', exercise.id, outcome.opponent, origin);
        } else if (outcome.kind === 'ffa') {
          onOpenMatchCamera('Battle Ground', 'ffa', exercise.id, undefined, origin);
        } else {
          onOpenMatchCamera(outcome.opponent, 'quickjoin', exercise.id, undefined, origin);
        }
      },
    });
  };

  const handleStartCustomMatch = (
    opponent: string,
    mode: 'faceoff' | 'quickjoin' | 'ffa',
    exerciseId: string,
    customRoomId?: string
  ) => {
    const userId =
      currentUser?.user_metadata?.username ||
      currentUser?.email ||
      currentUser?.user?.id ||
      currentUser?.id ||
      'player';

    if (customRoomId) {
      connectMatchSocket(userId, customRoomId);
    }
    onOpenMatchCamera(opponent, mode, exerciseId);
  };

  const [showAiModal, setShowAiModal] = useState<boolean>(false);
  const [aiModalExerciseId, setAiModalExerciseId] = useState<string>('1');
  const [aiOrigin, setAiOrigin] = useState<SessionOrigin>('detail');

  const goLobby = useCallback(() => {
    setActiveSubTab('lobby');
    onTabChange('home');
  }, [onTabChange, setActiveSubTab]);

  const handleOpenAiDuel = useCallback((exerciseId?: string, origin: SessionOrigin = 'detail') => {
    if (exerciseId) setAiModalExerciseId(exerciseId);
    setAiOrigin(origin);
    setShowAiModal(true);
  }, []);

  const handleStartAiDuel = useCallback((bot: AIBotProfile, exerciseId: string) => {
    setShowAiModal(false);
    onOpenMatchCamera(bot.name, 'ai_battle', exerciseId, undefined, aiOrigin);
  }, [onOpenMatchCamera, aiOrigin]);

  // Lobby play button (design 3.6). Guests are sent to sign in for online modes.
  const handlePlay = (mode: LobbyMode, exercise: ExerciseItem) => {
    if (isGuest && modeNeedsAuth(mode)) {
      onShowAuthModal();
      return;
    }
    switch (mode) {
      case 'quick_duel':
        handleJoinQueue(exercise, 'quick_start', 'lobby');
        break;
      case 'battle_ground':
        handleJoinQueue(exercise, 'ffa', 'lobby');
        break;
      case 'ai_duel':
        handleOpenAiDuel(exercise.id, 'lobby');
        break;
      default:
        onOpenCamera(exercise.id, exercise.name, false, 'lobby');
    }
  };

  const renderUnderDevelopment = (featureName: string) => (
    <View style={styles.devContainer}>
      <View style={styles.devCard}>
        <View style={styles.devIconBadge}><Wrench size={26} color="#E25822" /></View>
        <Text style={styles.devTitle}>{featureName}</Text>
        <View style={styles.devPillTag}><Text style={styles.devPillTagText}>Under Development</Text></View>
        <Text style={styles.devSubtitle}>We are working hard to bring you the {featureName} module. Stay tuned for upcoming updates!</Text>
        <TouchableOpacity style={styles.devBackButton} activeOpacity={0.8} onPress={() => { setSelectedExercise(null); goLobby(); }}>
          <Text style={styles.devBackButtonText}>← Return to Lobby</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const mainContent = useMemo(() => {
    if (selectedExercise) {
      return (
        <ExerciseDetailScreen
          exercise={selectedExercise}
          detailTab={detailSubTab}
          onBack={() => {
            setSelectedExercise(null);
            setSelectedExerciseId(null);
          }}
          onJoinQueue={handleJoinQueue}
          onDetailTabChange={setDetailSubTab}
          onStartCustomMatch={handleStartCustomMatch}
          onOpenCamera={onOpenCamera}
          onSettingsPress={() => setShowSettingsModal(true)}
          onOpenAiDuel={handleOpenAiDuel}
        />
      );
    }

    if (activeTab === 'workouts') {
      return (
        <ExercisesScreen
          exercises={exercisesList}
          queueCounts={queueCounts}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          onExerciseSelect={setSelectedExercise}
          onRefreshExercises={loadExercises}
          onBack={goLobby}
          onAction={(action, exercise) => {
            switch (action) {
              case 'tutor':
                onOpenCamera(exercise.id, exercise.name, true, 'train');
                break;
              case 'solo':
                onOpenCamera(exercise.id, exercise.name, false, 'train');
                break;
              case 'ai':
                handleOpenAiDuel(exercise.id, 'train');
                break;
              case 'ranked':
                handleJoinQueue(exercise, 'quick_start', 'train');
                break;
              default:
                setSelectedExercise(exercise);
            }
          }}
        />
      );
    }

    if (activeTab === 'profile' || activeTab === 'social') {
      return (
        <ProfileScreen
          currentUser={currentUser}
          onBack={goLobby}
          onLogout={onLogout || (() => {})}
        />
      );
    }

    if (activeTab === 'shop') {
      return <AvatarShopScreen onBack={goLobby} />;
    }

    if (activeTab === 'explore') {
      return (
        <CommunityScreen
          currentUser={currentUser}
          onBack={goLobby}
          onOpenMatchCamera={onOpenMatchCamera}
        />
      );
    }

    if (activeTab !== 'home') {
      return renderUnderDevelopment('Special Events');
    }

    if (activeSubTab === 'news') {
      return (
        <View style={{ flex: 1 }}>
          <GameTopBar title="News" onBack={goLobby} />
          <NewsScreen />
        </View>
      );
    }

    return (
      <LobbyScreen
        isGuest={isGuest}
        onPlay={handlePlay}
        onOpenCamera={onOpenCamera}
        onSettingsPress={() => setShowSettingsModal(true)}
        onNavigate={(to) => {
          if (to === 'news') {
            setActiveSubTab(to);
            return;
          }
          // Same rule as the tab bar: guests sign in for Train, Squad and Profile.
          if (isGuest && to !== 'shop') {
            onShowAuthModal();
            return;
          }
          onTabChange(to);
        }}
      />
    );
  }, [activeSubTab, activeTab, currentUser, detailSubTab, exercisesList, handleOpenAiDuel, isGuest, onlineCount, onLogout, onOpenCamera, onShowAuthModal, onTabChange, goLobby, playerLevel, queueCounts, selectedCategory, selectedExercise, selectedModel]);

  const lobbyActive = activeTab === 'home' && activeSubTab === 'lobby' && !selectedExercise;

  return (
    <SafeAreaView
      // the lobby runs edge to edge at the bottom (its own bar keeps clear of the gesture area)
      edges={lobbyActive ? ['top', 'left', 'right'] : undefined}
      style={[styles.container, lobbyActive && styles.containerClear, activeTab === 'shop' && styles.containerHall]}
    >
      {/* Lobby: the gradient sits behind the whole screen, under the (edge-to-edge) status bar. */}
      {lobbyActive && <ScreenBackground style={StyleSheet.absoluteFill} />}
      <ThemedStatusBar />

      <View style={styles.mainContent}>{mainContent}</View>

      <LevelUpCelebration />

      <HumanVsAIModal
        visible={showAiModal}
        onClose={() => setShowAiModal(false)}
        exercises={exercisesList}
        selectedExerciseId={aiModalExerciseId}
        onStartMatch={handleStartAiDuel}
      />

      <GameSettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
        recommendedModel={recommendedModel}
        deviceName={deviceName}
        totalRamGb={totalRamGb}
        heavyStatus={
          isReady(heavyPack)
            ? undefined
            : heavyPack.status === 'failed' || heavyPack.status === 'unavailable'
              ? 'Download failed'
              : `Downloading ${formatProgress(heavyPack, PACK_SIZES.pose_heavy)}`
        }
      />
    </SafeAreaView>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  containerClear: { backgroundColor: 'transparent' },
  // the Shop's deep-blue hero hall reaches under the system bars
  containerHall: { backgroundColor: '#0C1230' },
  mainContent: { flex: 1 },
  devContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  devCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  devIconBadge: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(232, 213, 196, 0.15)', borderWidth: 1, borderColor: 'rgba(232, 213, 196, 0.3)', alignItems: 'center', justifyContent: 'center' },
  devIconText: { fontSize: 28 },
  devTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 16 },
  devPillTag: { marginTop: 10, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  devPillTagText: { color: '#FBBF24', fontSize: 11, fontWeight: '700' },
  devSubtitle: { color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: 14, fontSize: 13 },
  devBackButton: { marginTop: 20, backgroundColor: '#E8D5C4', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 12 },
  devBackButtonText: { color: '#11141A', fontWeight: '800', fontSize: 14 },
})
);
