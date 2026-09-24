import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Bot, Swords, Users, Zap } from 'lucide-react-native';
import { Avatar, getAvatarUri } from '../../../components/Avatar';
import { TierIcon } from '../../../components/TierIcon';
import { useGameStats } from '../../../hooks/useGameStats';
import { useUserStore } from '../../../store/userStore';
import { colors, radius } from '../../../theme';
import { supabase } from '../../../utils/supabase';
import { computeTotalXp, levelFromXp } from '../../../utils/gamification';
import { getBotByName } from '../../../utils/aiBotService';
import type { SimulatedOpponent } from '../../../utils/simulatedOpponent';
import type { MatchMode } from './MatchCameraScreen';

// Keep the card up at least this long so the entrance animation always plays out.
const MIN_SHOW_MS = 2400;
const FIGHT_MS = 700;

const MODE_LABELS: Record<MatchMode, string> = {
  quickjoin: 'QUICK DUEL',
  faceoff: 'FACEOFF',
  ffa: 'BATTLE GROUND',
  ai_battle: 'AI DUEL',
};

const EXERCISE_NAMES: Record<string, string> = {
  '1': 'Squats',
  '2': 'Sit-ups',
  '3': 'Triangle Pose',
  '4': 'Lunges',
  '5': 'Crunches',
  '6': 'Cobra Pose',
  '7': 'Push-ups',
  '8': "Child's Pose",
};

interface OpponentCard {
  name: string;
  avatarUrl?: string | null;
  avatarConfig?: any;
  level?: number;
  title?: string;
  kind: 'player' | 'bot' | 'crowd';
}

interface VersusIntroProps {
  mode: MatchMode;
  opponentUsername: string;
  exerciseId: string;
  simulatedOpponent?: SimulatedOpponent | null;
  lobbyPlayerCount?: number;
  /** True once both sides are synced; the card then shows FIGHT! and fades out. */
  ready: boolean;
  /** Live sync status shown until `ready` (e.g. "Waiting for opponent..."). */
  statusText: string;
  onCancel?: () => void;
  onDone: () => void;
}

/** Fighting-game style "YOU vs RIVAL" card shown while players sync, instead of a loading screen. */
export const VersusIntro: React.FC<VersusIntroProps> = ({
  mode,
  opponentUsername,
  exerciseId,
  simulatedOpponent,
  lobbyPlayerCount = 0,
  ready,
  statusText,
  onCancel,
  onDone,
}) => {
  const { width, height } = useWindowDimensions();
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const { level } = useGameStats();

  const selfName = profile?.username || user?.user_metadata?.username || 'You';

  const [opponent, setOpponent] = useState<OpponentCard>(() => {
    if (mode === 'ffa') {
      return { name: 'Battle Ground', kind: 'crowd' };
    }
    if (mode === 'ai_battle') {
      const bot = getBotByName(opponentUsername);
      return { name: bot?.name || opponentUsername, title: bot?.tier, kind: 'bot' };
    }
    if (simulatedOpponent) {
      return {
        name: simulatedOpponent.username,
        avatarUrl: getAvatarUri(simulatedOpponent.username),
        level: simulatedOpponent.level,
        title: levelTitle(simulatedOpponent.level),
        kind: 'player',
      };
    }
    return { name: opponentUsername, kind: 'player' };
  });

  // Real opponents: pull their avatar and work out their level from their profile.
  useEffect(() => {
    if (mode === 'ffa' || mode === 'ai_battle' || simulatedOpponent || !opponentUsername) return;
    let active = true;
    supabase
      .from('profiles')
      .select('*')
      .eq('username', opponentUsername)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const lv = levelFromXp(computeTotalXp(data as any));
        setOpponent((prev) => ({
          ...prev,
          avatarUrl: data.avatar_url,
          avatarConfig: data.avatar_config,
          level: lv.level,
          title: lv.title,
        }));
      });
    return () => {
      active = false;
    };
  }, [mode, opponentUsername, simulatedOpponent]);

  const selfSlide = useRef(new Animated.Value(-1)).current;
  const oppSlide = useRef(new Animated.Value(1)).current;
  const vsScale = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;
  const fightScale = useRef(new Animated.Value(0)).current;
  const [showFight, setShowFight] = useState(false);
  const [minTimeReached, setMinTimeReached] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fadeOut, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(selfSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        Animated.spring(oppSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]),
      Animated.spring(vsScale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
      Animated.sequence(
        [8, -8, 5, -5, 0].map((v) =>
          Animated.timing(shake, { toValue: v, duration: 45, easing: Easing.linear, useNativeDriver: true })
        )
      ),
    ]).start();

    const t = setTimeout(() => setMinTimeReached(true), MIN_SHOW_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everyone synced (and the entrance has played): FIGHT! then reveal the match.
  useEffect(() => {
    if (!ready || !minTimeReached || showFight) return;
    setShowFight(true);
    Animated.spring(fightScale, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    const t = setTimeout(finish, FIGHT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minTimeReached]);

  const exerciseName = EXERCISE_NAMES[String(exerciseId).replace(/_.*/, '')] || 'Workout';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fadeOut }]}>
      <View style={StyleSheet.absoluteFill}>
        {/* Diagonal panels */}
        <Animated.View
          style={[
            styles.panel,
            styles.selfPanel,
            { width: width * 1.6, height: height * 0.62, left: -width * 0.3, top: -height * 0.12 },
            { transform: [{ translateX: selfSlide.interpolate({ inputRange: [-1, 0], outputRange: [-width, 0] }) }, { rotate: '-9deg' }] },
          ]}
        />
        <Animated.View
          style={[
            styles.panel,
            styles.oppPanel,
            { width: width * 1.6, height: height * 0.62, left: -width * 0.3, bottom: -height * 0.12 },
            { transform: [{ translateX: oppSlide.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }, { rotate: '-9deg' }] },
          ]}
        />

        {/* Mode banner */}
        <View style={styles.banner}>
          <Swords size={14} color={colors.text} />
          <Text style={styles.bannerText}>
            {MODE_LABELS[mode]} · {exerciseName.toUpperCase()}
          </Text>
        </View>

        {/* YOU */}
        <Animated.View
          style={[
            styles.fighter,
            styles.selfFighter,
            { transform: [{ translateX: selfSlide.interpolate({ inputRange: [-1, 0], outputRange: [-width, 0] }) }] },
          ]}
        >
          <View style={[styles.avatarRing, { borderColor: colors.text }]}>
            <Avatar username={selfName} size={104} config={profile?.avatar_config} avatarUrl={profile?.avatar_url} />
          </View>
          <View style={styles.fighterInfo}>
            <Text style={styles.youTag}>YOU</Text>
            <Text style={styles.fighterName} numberOfLines={1}>{selfName}</Text>
            <View style={styles.levelChip}>
              <TierIcon level={Math.min(6, Math.ceil(level.level / 3))} size={12} color={colors.text} />
              <Text style={styles.levelChipText}>LV {level.level} · {level.title}</Text>
            </View>
          </View>
        </Animated.View>

        {/* VS */}
        <Animated.View style={[styles.vsWrap, { transform: [{ scale: vsScale }, { translateX: shake }] }]}>
          <View style={styles.vsCircle}>
            <Text style={styles.vsText}>VS</Text>
          </View>
        </Animated.View>

        {/* OPPONENT */}
        <Animated.View
          style={[
            styles.fighter,
            styles.oppFighter,
            { transform: [{ translateX: oppSlide.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) }] },
          ]}
        >
          <View style={[styles.fighterInfo, { alignItems: 'flex-end' }]}>
            <Text style={styles.youTag}>{opponent.kind === 'crowd' ? 'ARENA' : 'RIVAL'}</Text>
            <Text style={[styles.fighterName, { textAlign: 'right' }]} numberOfLines={1}>
              {opponent.kind === 'crowd' ? `${Math.max(2, lobbyPlayerCount)} Athletes` : opponent.name}
            </Text>
            {opponent.kind === 'crowd' ? (
              <View style={[styles.levelChip, { alignSelf: 'flex-end' }]}>
                <Users size={12} color={colors.text} />
                <Text style={styles.levelChipText}>Free-for-all · Top 3 score</Text>
              </View>
            ) : opponent.level || opponent.title ? (
              <View style={[styles.levelChip, { alignSelf: 'flex-end' }]}>
                {opponent.level ? (
                  <TierIcon level={Math.min(6, Math.ceil(opponent.level / 3))} size={12} color={colors.text} />
                ) : null}
                <Text style={styles.levelChipText}>
                  {opponent.level ? `LV ${opponent.level}` : ''}
                  {opponent.level && opponent.title ? ' · ' : ''}
                  {opponent.title || ''}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.avatarRing, { borderColor: colors.lavender }]}>
            {opponent.kind === 'crowd' ? (
              <View style={styles.iconAvatar}>
                <Users size={48} color={colors.text} />
              </View>
            ) : opponent.kind === 'bot' ? (
              <View style={styles.iconAvatar}>
                <Bot size={48} color={colors.text} />
              </View>
            ) : (
              <Avatar
                username={opponent.name}
                size={104}
                config={opponent.avatarConfig}
                avatarUrl={opponent.avatarUrl}
              />
            )}
          </View>
        </Animated.View>

        {/* Sync status -> FIGHT! */}
        <View style={styles.footer}>
          {showFight ? (
            <Animated.Text style={[styles.fightText, { transform: [{ scale: fightScale }] }]}>FIGHT!</Animated.Text>
          ) : (
            <>
              <View style={styles.statusRow}>
                <ActivityIndicator size="small" color={colors.text} />
                <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
              </View>
              {onCancel && (
                <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.8} onPress={onCancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </Animated.View>
  );
};

function levelTitle(level: number): string {
  if (level >= 20) return 'Legend';
  if (level >= 15) return 'Champion';
  if (level >= 10) return 'Master';
  if (level >= 6) return 'Warrior';
  if (level >= 3) return 'Challenger';
  return 'Rookie';
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surfaceSunken, zIndex: 500, elevation: 50, overflow: 'hidden' },
  panel: { position: 'absolute' },
  selfPanel: { backgroundColor: colors.flame },
  oppPanel: { backgroundColor: colors.navy },

  banner: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  bannerText: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },

  fighter: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 16 },
  selfFighter: { top: '17%' },
  oppFighter: { bottom: '19%', justifyContent: 'flex-end' },
  avatarRing: {
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  iconAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fighterInfo: { flex: 1 },
  youTag: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '900', letterSpacing: 3 },
  fighterName: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 2 },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  levelChipText: { color: colors.text, fontSize: 11.5, fontWeight: '800' },

  vsWrap: { position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center' },
  vsBolt: { marginBottom: -10, zIndex: 2 },
  vsCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: { color: colors.text, fontSize: 40, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },

  footer: { position: 'absolute', bottom: 44, left: 0, right: 0, alignItems: 'center' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    maxWidth: '88%',
  },
  statusText: { color: colors.text, fontSize: 13, fontWeight: '800', flexShrink: 1 },
  cancelBtn: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  cancelText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800' },
  fightText: { color: colors.gold, fontSize: 54, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
});
