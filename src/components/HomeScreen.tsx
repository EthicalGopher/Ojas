import React, { useEffect, useMemo, useCallback, useRef, useState } from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ModelComplexity } from '../utils/deviceSpecs';
import { getDeviceInfo, getRecommendedModel } from '../utils/deviceSpecs';
import {
  addMatchMessageListener,
  connectMatchSocket,
  connectPresenceSocket,
  disconnectMatchSocket,
  disconnectPresenceSocket,
  fetchQueueCounts,
} from '../utils/matchmaking';
import { useMatchmakingStore } from '../store/matchmakingStore';
import { useUserStore } from '../store/userStore';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';
import { ExercisesScreen, ExerciseItem } from '../screens/ExercisesScreen';
import { HomeFeedScreen } from '../screens/HomeFeedScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { DEFAULT_EXERCISES, fetchExercisesFromSupabase } from '../utils/exerciseService';
import { Header } from './Header';

export type MainTab = 'home' | 'explore' | 'workouts' | 'social' | 'profile';

type SubTab = 'feed' | 'news';
type DetailSubTab = 'workouts' | 'shop' | 'leaderboard' | 'how_to_play';
type ExerciseCategory = 'all' | 'strength' | 'cardio' | 'flexibility';

interface HomeScreenProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onOpenCamera: (exerciseId?: string, exerciseName?: string) => void;
  onOpenMatchCamera: (opponent: string, mode: 'faceoff' | 'quickjoin' | 'ffa', exerciseId?: string) => void;
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
  const [exercisesList, setExercisesList] = useState<ExerciseItem[]>(DEFAULT_EXERCISES);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('feed');
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>('all');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseItem | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<DetailSubTab>('workouts');
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [deviceName, setDeviceName] = useState<string>('Mobile Device');
  const [totalRamGb, setTotalRamGb] = useState<number>(4.0);
  const [recommendedModel, setRecommendedModel] = useState<ModelComplexity>('medium');
  const onlineCount = useMatchmakingStore((state) => state.total_online);
  const queueCounts = useMatchmakingStore((state) => state.exercise_counts);
  const setCounts = useMatchmakingStore((state) => state.setCounts);

  const selectedExerciseId = useUserStore((state) => state.selectedExerciseId);
  const setSelectedExerciseId = useUserStore((state) => state.setSelectedExerciseId);

  const loadExercises = useCallback(async () => {
    try {
      const data = await fetchExercisesFromSupabase();
      if (data && data.length > 0) {
        setExercisesList(data);
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

  const getModelTitle = (model: ModelComplexity) => {
    switch (model) {
      case 'light':
        return 'Light Model (Lite)';
      case 'high':
        return 'High Model (Heavy)';
      case 'medium':
      default:
        return 'Medium Model (Full)';
    }
  };

  const handleJoinQueue = (exercise: ExerciseItem, queue: 'faceoff' | 'quick_start' | 'ffa') => {
    const isFFA = queue === 'ffa';

    const userId =
      currentUser?.user_metadata?.username ||
      currentUser?.email ||
      currentUser?.user?.id ||
      currentUser?.id ||
      `Player_${Math.floor(1000 + Math.random() * 9000)}`;

    if (isFFA) {
      onEnterQueue(
        'FREE FOR ALL LOBBY',
        'Gathering athletes (Max 10). Match starts when timer expires or lobby fills...',
        'WAITING: 30s',
        '👥 1 Athlete Joined',
        true
      );

      const matchQueueId = `${exercise.id}_ffa`;
      connectMatchSocket(userId, matchQueueId);

      const cleanup = addMatchMessageListener((msg) => {
        if (msg.type === 'ffa_lobby_update') {
          onUpdateQueueStatus?.(
            'FREE FOR ALL LOBBY',
            `Match starts in ${msg.countdown}s (or when 10 athletes join)...`,
            `STARTING IN ${msg.countdown}s`,
            `👥 ${msg.player_count} ${msg.player_count === 1 ? 'Athlete' : 'Athletes'} in Lobby (Max 10)`,
            msg.countdown,
            msg.player_count
          );
        } else if (msg.type === 'ffa_matched') {
          onOpenMatchCamera('Free For All', 'ffa', exercise.id);
          cleanup();
        }
      });
    } else {
      onEnterQueue(
        'FINDING OPPONENT',
        'Searching for a worthy rival in the queue...',
        undefined,
        undefined,
        false
      );

      const matchQueueId = `${exercise.id}_${queue}`;
      connectMatchSocket(userId, matchQueueId);

      const cleanup = addMatchMessageListener((msg) => {
        if (msg.type === 'matched') {
          onOpenMatchCamera(msg.opponent, queue === 'quick_start' ? 'quickjoin' : 'faceoff', exercise.id);
          cleanup();
        }
      });
    }
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

  const renderUnderDevelopment = (featureName: string) => (
    <View style={styles.devContainer}>
      <View style={styles.devCard}>
        <View style={styles.devIconBadge}><Text style={styles.devIconText}>🚧</Text></View>
        <Text style={styles.devTitle}>{featureName}</Text>
        <View style={styles.devPillTag}><Text style={styles.devPillTagText}>Under Development</Text></View>
        <Text style={styles.devSubtitle}>We are working hard to bring you the {featureName} module. Stay tuned for upcoming updates!</Text>
        <TouchableOpacity style={styles.devBackButton} activeOpacity={0.8} onPress={() => { setSelectedExercise(null); onTabChange('home'); setActiveSubTab('feed'); }}>
          <Text style={styles.devBackButtonText}>← Return to Feed</Text>
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
        />
      );
    }

    if (activeTab === 'profile' || activeTab === 'social') {
      return (
        <ProfileScreen
          currentUser={currentUser}
          onBack={() => onTabChange('home')}
          onLogout={onLogout || (() => {})}
        />
      );
    }

    if (activeTab !== 'home') {
      return renderUnderDevelopment(
        activeTab === 'explore' ? 'Explore Section' : 'Special Events'
      );
    }

    if (activeSubTab === 'news') {
      return renderUnderDevelopment('News & Updates Feed');
    }

    return (
      <HomeFeedScreen
        onlineCount={onlineCount}
        selectedModel={selectedModel}
        onExerciseSelect={setSelectedExercise}
        onSettingsPress={() => setShowSettingsModal(true)}
        onOpenCamera={onOpenCamera}
        onNavigateToTab={onTabChange}
        featuredExercise={exercisesList[0]}
      />
    );
  }, [activeSubTab, activeTab, currentUser, detailSubTab, exercisesList, onlineCount, onLogout, onOpenCamera, onTabChange, queueCounts, selectedCategory, selectedExercise, selectedModel]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D111A" />

      {activeTab === 'home' && !selectedExercise && (
        <Header
          username={currentUser?.user_metadata?.username || currentUser?.email || 'guest'}
          onlineCount={onlineCount}
          onProfilePress={() => onTabChange('profile')}
        />
      )}

      {activeTab === 'home' && !selectedExercise && (
        <View style={styles.subNavBar}>
          <TouchableOpacity style={[styles.subNavTab, activeSubTab === 'feed' && styles.subNavTabActive]} activeOpacity={0.8} onPress={() => setActiveSubTab('feed')}>
            <Text style={[styles.subNavTabText, activeSubTab === 'feed' && styles.subNavTabTextActive]}>FEED</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.subNavTab, activeSubTab === 'news' && styles.subNavTabActive]} activeOpacity={0.8} onPress={() => setActiveSubTab('news')}>
            <View style={styles.newsTabRow}>
              <Text style={[styles.subNavTabText, activeSubTab === 'news' && styles.subNavTabTextActive]}>NEWS</Text>
              <View style={styles.redBadgeDot} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainContent}>{mainContent}</View>

      <Modal visible={showSettingsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚙️ Settings & Model Choice</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Text style={styles.modalCloseIconText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              <View style={styles.specCard}>
                <Text style={styles.specCardTitle}>📱 Detected Device Specs</Text>
                <Text style={styles.specDetailText}>Model: <Text style={styles.specHighlightText}>{deviceName}</Text> | Memory: <Text style={styles.specHighlightText}>{totalRamGb} GB RAM</Text></Text>
                <Text style={styles.specDetailText}>Hardware Recommendation: <Text style={styles.specRecommendText}>{getModelTitle(recommendedModel)}</Text></Text>
              </View>

              <Text style={styles.modelSectionHeading}>Select Pose Model:</Text>

              {(['light', 'medium', 'high'] as const).map((model) => (
                <TouchableOpacity
                  key={model}
                  style={[styles.optionCard, selectedModel === model && styles.optionCardSelected]}
                  activeOpacity={0.85}
                  onPress={() => onSelectModel(model)}
                >
                  <View style={styles.optionHeaderRow}>
                    <Text style={styles.optionTitle}>{model === 'light' ? '⚡ Light Model (Lite)' : model === 'medium' ? '🎯 Medium Model (Full)' : '🔥 High Model (Heavy)'}</Text>
                    {recommendedModel === model && <View style={styles.recommendBadge}><Text style={styles.recommendBadgeText}>Recommended</Text></View>}
                  </View>
                  <Text style={styles.optionDescription}>
                    {model === 'light' ? 'Fastest FPS & lowest memory (~2.7 MB). Best for entry-level phones.' : model === 'medium' ? 'Balanced speed & joint accuracy (~6.2 MB). Ideal for mid-range phones.' : 'Maximum joint precision (~27 MB). Best for high-end flagship phones.'}
                  </Text>
                </TouchableOpacity>
              ))}

              <View style={styles.specCard}>
                <Text style={styles.specCardTitle}>🚧 3D VR Avatar System</Text>
                <Text style={styles.specDetailText}>3D VRM Kalidokit full-body rigging is currently <Text style={{ color: '#F59E0B', fontWeight: '700' }}>Under Development</Text> for a future release.</Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveSettingsButton} activeOpacity={0.8} onPress={() => setShowSettingsModal(false)}>
              <Text style={styles.saveSettingsButtonText}>Save & Apply Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1C20' },
  subNavBar: { flexDirection: 'row', height: 44, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', backgroundColor: '#1A1C20' },
  subNavTab: { flex: 1, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  subNavTabActive: { borderBottomColor: '#E8D5C4' },
  subNavTabText: { color: '#8E95A0', fontSize: 13, fontWeight: '700', letterSpacing: 0.8 },
  subNavTabTextActive: { color: '#E8D5C4' },
  newsTabRow: { flexDirection: 'row', alignItems: 'center' },
  redBadgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginLeft: 6 },
  mainContent: { flex: 1 },
  devContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  devCard: { backgroundColor: '#161F30', borderRadius: 24, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  devIconBadge: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(232, 213, 196, 0.15)', borderWidth: 1, borderColor: 'rgba(232, 213, 196, 0.3)', alignItems: 'center', justifyContent: 'center' },
  devIconText: { fontSize: 28 },
  devTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 16 },
  devPillTag: { marginTop: 10, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  devPillTagText: { color: '#FBBF24', fontSize: 11, fontWeight: '700' },
  devSubtitle: { color: '#8E95A0', textAlign: 'center', lineHeight: 20, marginTop: 14, fontSize: 13 },
  devBackButton: { marginTop: 20, backgroundColor: '#E8D5C4', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 12 },
  devBackButtonText: { color: '#11141A', fontWeight: '800', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5, 8, 14, 0.82)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  modalCard: { width: '100%', maxWidth: 400, backgroundColor: '#161F30', borderRadius: 28, padding: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  modalCloseIconText: { color: '#8E95A0', fontSize: 20, fontWeight: '700', padding: 4 },
  specCard: { backgroundColor: '#0D111A', borderRadius: 16, padding: 14, marginTop: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  specCardTitle: { color: '#FFF', fontSize: 14, fontWeight: '800', marginBottom: 6 },
  specDetailText: { color: '#8E95A0', fontSize: 12.5, lineHeight: 18 },
  specHighlightText: { color: '#FFF', fontWeight: '700' },
  specRecommendText: { color: '#E8D5C4', fontWeight: '800' },
  modelSectionHeading: { color: '#F8FAFC', fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  optionCard: { backgroundColor: '#0D111A', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  optionCardSelected: { borderColor: '#E8D5C4', backgroundColor: 'rgba(232, 213, 196, 0.08)' },
  optionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  optionTitle: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  recommendBadge: { backgroundColor: 'rgba(232, 213, 196, 0.2)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(232, 213, 196, 0.35)' },
  recommendBadgeText: { color: '#E8D5C4', fontSize: 10, fontWeight: '800' },
  optionDescription: { color: '#8E95A0', fontSize: 12, marginTop: 6, lineHeight: 17 },
  saveSettingsButton: { marginTop: 16, backgroundColor: '#E8D5C4', borderRadius: 24, paddingVertical: 14, alignItems: 'center', shadowColor: '#E8D5C4', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  saveSettingsButtonText: { color: '#11141A', fontSize: 15, fontWeight: '900' },
});
