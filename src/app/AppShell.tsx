import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';

import { GetStartedScreen } from '../screens/GetStartedScreen';
import { LoadingScreen } from '../screens/LoadingScreen';
import { FFALoadingScreen } from '../screens/FFALoadingScreen';
import { HomeScreen } from '../components/HomeScreen';
import { AuthModal } from '../features/auth/components/AuthModal';
import { CameraScreen } from '../features/camera/components/CameraScreen';
import { MatchCameraScreen } from '../features/match/components/MatchCameraScreen';
import { TabBar } from '../components/TabBar';

import { Swords, Video, Zap, Check, X, Flame } from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import type { MainTab } from '../components/HomeScreen';
import type { ModelComplexity } from '../utils/deviceSpecs';
import {
  connectMatchSocket,
  disconnectMatchSocket,
  addMatchMessageListener,
} from '../utils/matchmaking';
import { supabase } from '../utils/supabase';
import { useUserStore } from '../store/userStore';
import {
  initBattleChannel,
  acceptCustomBattleInvite,
  declineCustomBattleInvite,
  BattleInvite,
} from '../utils/customBattleService';

export default function AppShell() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMatchCamera, setIsMatchCamera] = useState<boolean>(false);
  const [matchWaiting, setMatchWaiting] = useState<boolean>(false);
  const [isFFALobby, setIsFFALobby] = useState<boolean>(false);
  const [ffaLobbyCountdown, setFfaLobbyCountdown] = useState<number>(30);
  const [ffaLobbyPlayerCount, setFfaLobbyPlayerCount] = useState<number>(1);
  const [waitingTitle, setWaitingTitle] = useState<string>('FINDING OPPONENT');
  const [waitingMessage, setWaitingMessage] = useState<string>('Searching for a worthy rival in the queue...');
  const [waitingBadge, setWaitingBadge] = useState<string | undefined>(undefined);
  const [waitingSubInfo, setWaitingSubInfo] = useState<string | undefined>(undefined);
  const [opponentUsername, setOpponentUsername] = useState<string>('');
  const [matchMode, setMatchMode] = useState<'faceoff' | 'quickjoin' | 'ffa'>('faceoff');
  const [matchExerciseId, setMatchExerciseId] = useState<string>('1');
  const [selectedModel, setSelectedModel] = useState<ModelComplexity>('medium');
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [incomingInvite, setIncomingInvite] = useState<BattleInvite | null>(null);

  const [soloExerciseId, setSoloExerciseId] = useState<string>('1');
  const [soloExerciseName, setSoloExerciseName] = useState<string>('Squats');
  const { activeTab, setActiveTab, setUser } = useUserStore();

  // Listen for incoming 1v1 battle invites from friends
  useEffect(() => {
    if (!currentUser?.id) return;

    const cleanup = initBattleChannel(currentUser.id, (invite) => {
      setIncomingInvite(invite);
    });

    return () => {
      cleanup();
    };
  }, [currentUser?.id]);

  // Auth initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user) {
          setCurrentUser(session.user);
          setUser(session.user);
        }
      } catch (e) {
        console.warn('Auth session check failed:', e);
      } finally {
        setIsAuthLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser(session.user);
        setUser(session.user);
      } else {
        setCurrentUser(null);
        setUser(null);
      }
      setIsAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  // Auto handle orientation
  useEffect(() => {
    async function updateOrientation() {
      try {
        if (ScreenOrientation && ScreenOrientation.OrientationLock) {
          if (isFullscreen) {
            if (ScreenOrientation.lockAsync) {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
            }
          } else {
            if (ScreenOrientation.lockAsync) {
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            }
          }
        }
      } catch (e) {
        // ignore orientation errors on unsupported devices
      }
    }

    updateOrientation();
  }, [isFullscreen]);

  const handleAcceptIncomingInvite = async () => {
    if (!incomingInvite) return;
    const currentUsername =
      currentUser?.user_metadata?.username ||
      currentUser?.email?.split('@')[0] ||
      'Player';

    const matchRoomId = await acceptCustomBattleInvite(incomingInvite, currentUsername);
    const opponent = incomingInvite.senderUsername;
    const mode = incomingInvite.mode;
    const exerciseId = incomingInvite.exerciseId;

    setIncomingInvite(null);

    // Connect to the room and open match camera
    connectMatchSocket(currentUsername, matchRoomId);
    setOpponentUsername(opponent);
    setMatchMode(mode);
    setMatchExerciseId(exerciseId);
    setIsMatchCamera(true);
    setIsFullscreen(true);
  };

  const handleDeclineIncomingInvite = async () => {
    if (!incomingInvite) return;
    await declineCustomBattleInvite(incomingInvite);
    setIncomingInvite(null);
  };

  if (isAuthLoading) {
    return (
      <SafeAreaProvider>
        <LoadingScreen message="Initializing Ojas..." />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        {!currentUser ? (
          <GetStartedScreen
            onGetStarted={() => {
              setAuthMode('signup');
              setShowAuthModal(true);
            }}
            onLogIn={() => {
              setAuthMode('signin');
              setShowAuthModal(true);
            }}
          />
        ) : isMatchCamera ? (
          <MatchCameraScreen
            key={`match-${matchMode}-${opponentUsername}-${matchExerciseId}`}
            selectedModel={selectedModel}
            mode={matchMode}
            opponentUsername={opponentUsername}
            selfUsername={currentUser?.user_metadata?.username || currentUser?.email || 'user'}
            exerciseId={matchExerciseId}
            onClose={() => {
              setTimeout(() => {
                setIsMatchCamera(false);
                setIsFullscreen(false);
                setActiveTab('home');
                if (matchExerciseId) {
                  useUserStore.getState().setSelectedExerciseId(matchExerciseId);
                }
              }, 0);
            }}
            onRequeue={(nextMode, exId) => {
              setTimeout(() => {
                setIsMatchCamera(false);
                setIsFullscreen(false);
                setActiveTab('home');
                if (exId) {
                  useUserStore.getState().setSelectedExerciseId(exId);
                }
                const userId =
                  currentUser?.user_metadata?.username ||
                  currentUser?.email ||
                  currentUser?.user?.id ||
                  currentUser?.id ||
                  `Player_${Math.floor(1000 + Math.random() * 9000)}`;

                if (nextMode === 'ffa') {
                  setWaitingTitle('FREE FOR ALL LOBBY');
                  setWaitingMessage('Gathering athletes (Max 10). Match starts when timer expires or lobby fills...');
                  setWaitingBadge('WAITING: 30s');
                  setWaitingSubInfo('👥 1 Athlete Joined');
                  setIsFFALobby(true);
                  setFfaLobbyCountdown(30);
                  setFfaLobbyPlayerCount(1);
                  setMatchWaiting(true);

                  const matchQueueId = `${exId}_ffa`;
                  connectMatchSocket(userId, matchQueueId);

                  const cleanup = addMatchMessageListener((msg: any) => {
                    if (msg.type === 'ffa_lobby_update') {
                      setWaitingTitle('FREE FOR ALL LOBBY');
                      setWaitingMessage(`Match starts in ${msg.countdown}s (or when 10 athletes join)...`);
                      setWaitingBadge(`STARTING IN ${msg.countdown}s`);
                      setWaitingSubInfo(`👥 ${msg.player_count} ${msg.player_count === 1 ? 'Athlete' : 'Athletes'} in Lobby (Max 10)`);
                      setFfaLobbyCountdown(msg.countdown);
                      setFfaLobbyPlayerCount(msg.player_count);
                    } else if (msg.type === 'ffa_matched') {
                      setMatchWaiting(false);
                      setIsFFALobby(false);
                      setOpponentUsername('Free For All');
                      setMatchMode('ffa');
                      setMatchExerciseId(exId);
                      setIsMatchCamera(true);
                      setIsFullscreen(true);
                      cleanup();
                    }
                  });
                } else {
                  setWaitingTitle('FINDING OPPONENT');
                  setWaitingMessage('Searching for a worthy rival in the queue...');
                  setWaitingBadge(undefined);
                  setWaitingSubInfo(undefined);
                  setIsFFALobby(false);
                  setMatchWaiting(true);

                  const queueType = nextMode === 'quickjoin' ? 'quick_start' : 'faceoff';
                  const matchQueueId = `${exId}_${queueType}`;
                  connectMatchSocket(userId, matchQueueId);

                  const cleanup = addMatchMessageListener((msg: any) => {
                    if (msg.type === 'matched') {
                      setMatchWaiting(false);
                      setIsFFALobby(false);
                      setOpponentUsername(msg.opponent);
                      setMatchMode(queueType === 'quick_start' ? 'quickjoin' : 'faceoff');
                      setMatchExerciseId(exId);
                      setIsMatchCamera(true);
                      setIsFullscreen(true);
                      cleanup();
                    }
                  });
                }
              }, 0);
            }}
          />
        ) : isFullscreen ? (
          <CameraScreen
            selectedModel={selectedModel}
            exerciseId={soloExerciseId}
            exerciseName={soloExerciseName}
            onClose={() => {
              setIsFullscreen(false);
              setActiveTab('home');
              if (soloExerciseId) {
                useUserStore.getState().setSelectedExerciseId(soloExerciseId);
              }
            }}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <HomeScreen
              activeTab={activeTab as MainTab}
              onTabChange={setActiveTab}
              onOpenCamera={(exerciseId?: string, exerciseName?: string) => {
                if (exerciseId) setSoloExerciseId(exerciseId);
                if (exerciseName) setSoloExerciseName(exerciseName);
                setIsFullscreen(true);
              }}
              onOpenMatchCamera={(opponent: string, mode: 'faceoff' | 'quickjoin' | 'ffa', exerciseId?: string) => {
                setMatchWaiting(false);
                setIsFFALobby(false);
                setOpponentUsername(opponent);
                setMatchMode(mode);
                if (exerciseId) setMatchExerciseId(exerciseId);
                setIsMatchCamera(true);
                setIsFullscreen(true);
              }}
              onEnterQueue={(title?: string, message?: string, badge?: string, subInfo?: string, isFFA?: boolean) => {
                setWaitingTitle(title || 'FINDING OPPONENT');
                setWaitingMessage(message || 'Searching for a worthy rival in the queue...');
                setWaitingBadge(badge);
                setWaitingSubInfo(subInfo);
                setIsFFALobby(!!isFFA);
                if (isFFA) {
                  setFfaLobbyCountdown(30);
                  setFfaLobbyPlayerCount(1);
                }
                setMatchWaiting(true);
              }}
              onUpdateQueueStatus={(title?: string, message?: string, badge?: string, subInfo?: string, countdown?: number, playerCount?: number) => {
                if (title) setWaitingTitle(title);
                if (message) setWaitingMessage(message);
                if (badge !== undefined) setWaitingBadge(badge);
                if (subInfo !== undefined) setWaitingSubInfo(subInfo);
                if (typeof countdown === 'number') setFfaLobbyCountdown(countdown);
                if (typeof playerCount === 'number') setFfaLobbyPlayerCount(playerCount);
              }}
              onCancelQueue={() => {
                disconnectMatchSocket();
                setMatchWaiting(false);
                setIsFFALobby(false);
              }}
              onShowAuthModal={() => {
                setAuthMode('signin');
                setShowAuthModal(true);
              }}
              currentUser={currentUser}
              selectedModel={selectedModel}
              onSelectModel={setSelectedModel}
              onLogout={() => {
                setCurrentUser(null);
                setActiveTab('home');
              }}
            />

            <TabBar
              activeTab={activeTab}
              onTabPress={(tab) => setActiveTab(tab)}
              onProfilePress={() => {
                setActiveTab('profile');
              }}
            />
          </View>
        )}

        <AuthModal
          visible={showAuthModal}
          initialMode={authMode}
          onClose={() => setShowAuthModal(false)}
          onUserChange={(user) => {
            setCurrentUser(user);
            if (user) setShowAuthModal(false);
          }}
        />

        {matchWaiting && isFFALobby ? (
          <FFALoadingScreen
            serverSeconds={ffaLobbyCountdown}
            playerCount={ffaLobbyPlayerCount}
            maxPlayers={10}
            title={waitingTitle}
            message={waitingMessage}
            fullScreen={false}
            onCancel={() => {
              disconnectMatchSocket();
              setMatchWaiting(false);
              setIsFFALobby(false);
            }}
          />
        ) : matchWaiting ? (
          <LoadingScreen
            title={waitingTitle}
            message={waitingMessage}
            badgeText={waitingBadge}
            subInfo={waitingSubInfo}
            fullScreen={false}
            onCancel={() => {
              disconnectMatchSocket();
              setMatchWaiting(false);
              setIsFFALobby(false);
            }}
          />
        ) : null}

        {/* Incoming 1v1 Battle Challenge Modal */}
        {incomingInvite && (
          <View style={styles.incomingInviteOverlay}>
            <View style={styles.incomingInviteCard}>
              <View style={styles.incomingBadgePill}>
                <Swords size={13} color="#E8D5C4" />
                <Text style={styles.incomingBadgeText}>INCOMING 1V1 DUEL</Text>
              </View>

              <View style={styles.incomingAvatarWrapper}>
                <View style={styles.avatarGlowRing}>
                  <Avatar
                    username={incomingInvite.senderUsername}
                    size={72}
                    config={incomingInvite.senderAvatar}
                  />
                </View>
              </View>

              <Text style={styles.incomingSenderName}>
                @{incomingInvite.senderUsername}
              </Text>
              <Text style={styles.incomingChallengeText}>
                has challenged you to a 1v1{' '}
                <Text style={{ color: '#E8D5C4', fontWeight: '900' }}>
                  {incomingInvite.exerciseName}
                </Text>{' '}
                {incomingInvite.mode === 'faceoff' ? 'Live Camera Faceoff' : 'Score Duel'}!
              </Text>

              <View style={styles.incomingActionRow}>
                <TouchableOpacity
                  style={styles.incomingDeclineBtn}
                  activeOpacity={0.75}
                  onPress={handleDeclineIncomingInvite}
                >
                  <X size={15} color="#94A3B8" style={{ marginRight: 4 }} />
                  <Text style={styles.incomingDeclineText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.incomingAcceptBtn}
                  activeOpacity={0.85}
                  onPress={handleAcceptIncomingInvite}
                >
                  <Swords size={16} color="#0C0F14" style={{ marginRight: 6 }} />
                  <Text style={styles.incomingAcceptText}>ACCEPT BATTLE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1C20',
  },
  matchWaitingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  matchWaitingCard: {
    backgroundColor: '#161B22',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  matchWaitingTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  matchWaitingDesc: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  cancelQueueButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
  },
  cancelQueueButtonText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
  centerLoading: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D111A',
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 14,
  },
  incomingInviteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 200,
  },
  incomingInviteCard: {
    backgroundColor: '#161B22',
    borderRadius: 28,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 10,
  },
  incomingBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 213, 196, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(232, 213, 196, 0.35)',
    gap: 6,
    marginBottom: 16,
  },
  incomingBadgeText: {
    color: '#E8D5C4',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  incomingAvatarWrapper: {
    marginBottom: 12,
  },
  avatarGlowRing: {
    padding: 3,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: '#C8B6FF',
  },
  incomingSenderName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  incomingChallengeText: {
    color: '#94A3B8',
    fontSize: 13.5,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  incomingActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    width: '100%',
  },
  incomingDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 18,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  incomingDeclineText: {
    color: '#94A3B8',
    fontSize: 13.5,
    fontWeight: '800',
  },
  incomingAcceptBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8D5C4',
    borderRadius: 18,
    paddingVertical: 14,
    shadowColor: '#E8D5C4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  incomingAcceptText: {
    color: '#0C0F14',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
