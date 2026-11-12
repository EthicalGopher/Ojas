// Match intro: a plain "You VS Opponent" card while both sides sync, then FIGHT! and fade out.
// Full-height characters standing on their halves (you left, the opponent right), names and levels on plates,
// the live sync status below. No stage, flexing poses or camera tour.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Bot, Swords, Users } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { Slant } from '../../../components/game/Slant';
import { RankEmblem, rankTierFromTitle, tierNameFromTitle } from '../../../components/RankEmblem';
import { useGameStats } from '../../../hooks/useGameStats';
import { juice } from '../../../juice/juice';
import { useUserStore } from '../../../store/userStore';
import { useColors } from '../../../theme';
import { supabase } from '../../../utils/supabase';
import { computeTotalXp, levelFromXp } from '../../../utils/gamification';
import { getBotByName } from '../../../utils/aiBotService';
import type { SimulatedOpponent } from '../../../utils/simulatedOpponent';
import type { MatchMode } from './MatchCameraScreen';
import { FighterPanel } from './FighterPanel';
import { AI_RIVAL_MODEL, BUNDLED_AVATARS, characterVsScene, lookForName, lookOf } from '../../../utils/avatarShopService';

const FIGHT_MS = 1600;

const MODE_LABELS: Record<MatchMode, string> = {
  quickjoin: '1V1 DUEL',
  faceoff: '1V1 DUEL',
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
  '9': 'Tree Pose',
  '10': 'Warrior II',
};

interface OpponentInfo {
  name: string;
  look?: { equipped_avatar_id?: string | null; equipped_items?: any } | null;
  level?: number;
  title?: string;
  kind: 'player' | 'bot' | 'crowd';
}

interface ArenaIntroProps {
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

function levelTitle(level: number): string {
  if (level >= 20) return 'Legend';
  if (level >= 15) return 'Champion';
  if (level >= 10) return 'Master';
  if (level >= 6) return 'Warrior';
  if (level >= 3) return 'Challenger';
  return 'Rookie';
}

export const ArenaIntro: React.FC<ArenaIntroProps> = ({
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
  const c = useColors();
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const { level } = useGameStats();
  const selfName = profile?.username || user?.user_metadata?.username || 'You';
  const solo = mode === 'ffa';

  const [opponent, setOpponent] = useState<OpponentInfo>(() => {
    if (solo) return { name: 'Battle Ground', kind: 'crowd' };
    if (mode === 'ai_battle') {
      const bot = getBotByName(opponentUsername);
      return { name: bot?.name || opponentUsername, title: bot?.tier, kind: 'bot' };
    }
    if (simulatedOpponent) {
      return { name: simulatedOpponent.username, level: simulatedOpponent.level, title: levelTitle(simulatedOpponent.level), kind: 'player' };
    }
    return { name: opponentUsername, kind: 'player' };
  });

  // Real opponents: fetch their avatar and level.
  useEffect(() => {
    if (solo || mode === 'ai_battle' || simulatedOpponent || !opponentUsername) return;
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
          look: { equipped_avatar_id: (data as any).equipped_avatar_id, equipped_items: (data as any).equipped_items },
          level: lv.level,
          title: lv.title,
        }));
      });
    return () => {
      active = false;
    };
  }, [mode, opponentUsername, simulatedOpponent, solo]);

  const selfArt = useMemo(() => characterVsScene(lookOf(BUNDLED_AVATARS, profile as any).model), [profile]);
  const oppArt = useMemo(() => {
    if (solo) return null;
    const model =
      opponent.kind === 'bot'
        ? AI_RIVAL_MODEL
        : opponent.look
          ? lookOf(BUNDLED_AVATARS, opponent.look as any).model
          : lookForName(BUNDLED_AVATARS, opponent.name || 'rival').model;
    return characterVsScene(model);
  }, [solo, opponent.kind, opponent.look, opponent.name]);

  const exerciseName = EXERCISE_NAMES[String(exerciseId).replace(/_.*/, '')] || 'Workout';

  const fade = useRef(new Animated.Value(1)).current;
  const fightScale = useRef(new Animated.Value(0)).current;
  const [showFight, setShowFight] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!ready || showFight) return;
    setShowFight(true);
    juice.play('fight');
    Animated.spring(fightScale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      Animated.timing(fade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone());
    }, FIGHT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const oppMeta =
    [opponent.level ? `LV ${opponent.level}` : null, opponent.title].filter(Boolean).join(' · ') || 'Challenger';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <StatusBar hidden />

      <FighterPanel
        side="left"
        scene={selfArt}
        label="YOU"
        name={selfName}
        meta={
          <>
            <RankEmblem tier={rankTierFromTitle(level.title)} size={16} />
            <GText variant="label" size={12} style={{ color: '#FFFFFF' }}>LV {level.level} · {tierNameFromTitle(level.title)}</GText>
          </>
        }
      />
      <FighterPanel
        side="right"
        scene={oppArt}
        label={solo ? 'LOBBY' : 'OPPONENT'}
        name={opponent.name}
        placeholder={solo ? <Users size={120} color="rgba(170,200,255,0.85)" /> : undefined}
        meta={
          <>
            {opponent.kind === 'bot' && <Bot size={14} color="#FFFFFF" />}
            {solo && <Users size={14} color="#FFFFFF" />}
            <GText variant="label" size={12} style={{ color: '#FFFFFF' }}>
              {solo ? `${Math.max(2, lobbyPlayerCount)} ATHLETES` : oppMeta}
            </GText>
          </>
        }
      />
      <View style={styles.vsWrap} pointerEvents="none">
        {!showFight && <GText variant="hero" size={72} style={styles.vs}>VS</GText>}
      </View>

      <View style={styles.banner} pointerEvents="none">
        <Slant fill="#14141C" stroke="#3A3A48" />
        <Swords size={14} color={c.accentTo} />
        <GText variant="label" size={13} style={{ color: '#FFFFFF' }}>
          {MODE_LABELS[mode]} · {exerciseName.toUpperCase()}
        </GText>
      </View>

      <View style={styles.footer} pointerEvents="box-none">
        {showFight ? (
          <Animated.View style={{ transform: [{ scale: fightScale }, { rotate: '-6deg' }] }} pointerEvents="none">
            <GText variant="hero" size={72} style={styles.fight}>FIGHT!</GText>
          </Animated.View>
        ) : (
          <View style={styles.statusRow}>
            <View style={styles.statusPill} pointerEvents="none">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <GText variant="label" size={13} style={{ color: '#FFFFFF' }} numberOfLines={1}>{statusText}</GText>
            </View>
            {onCancel && (
              <Pressable onPress={onCancel} style={styles.ghostBtn} accessibilityRole="button">
                <GText variant="label" size={13} style={{ color: 'rgba(255,255,255,0.85)' }}>Cancel</GText>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: '#07070B', zIndex: 500, elevation: 50, alignItems: 'center', justifyContent: 'center' },
  banner: { position: 'absolute', top: 12, left: 16, height: 30, paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  vsWrap: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  vs: { color: '#FFD27A', textShadowColor: '#B53214', textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  footer: { position: 'absolute', bottom: 22, left: 0, right: 0, alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', maxWidth: 360 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,0,0,0.35)' },
  fight: { color: '#FFD27A', textShadowColor: '#B53214', textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
});
