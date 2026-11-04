// Match intro: the athletes are announced on a bodybuilding championship stage while both sides sync.
// One still, path-traced in Blender with both heroes on stage flexing (scripts/blender/render_arena.py
// --athletes -> assets/web/arena/both_<you>_<rival>.jpg, double size): no 3D or video on the phone, so it
// starts at once and never stalls matchmaking. The background never changes: it opens on the same
// blurred hall as matchmaking, clears to the stage, and a camera glides in on you, across to the rival
// and back out to both (names on the LED wall); FIGHT! when ready.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { AI_RIVAL_MODEL, AvatarModel, BUNDLED_AVATARS, lookForName, lookOf, resolveModelUrl } from '../../../utils/avatarShopService';

const FIGHT_MS = 2800;
// seconds per shot; 'both' holds until both sides are ready
const SHOTS: { name: Shot; dur: number }[] = [
  { name: 'stage', dur: 1.8 },
  { name: 'you', dur: 2.4 },
  { name: 'rival', dur: 2.4 },
  { name: 'both', dur: 0 },
];
type Shot = 'stage' | 'you' | 'rival' | 'both';
// camera per shot over the still: zoom and the point (fractions of the still) it centres on
const CAMERA: Record<Shot, { zoom: number; x: number; y: number }> = {
  stage: { zoom: 1.0, x: 0.5, y: 0.5 },
  you: { zoom: 2.1, x: 0.355, y: 0.5 },
  rival: { zoom: 2.1, x: 0.645, y: 0.5 },
  both: { zoom: 1.04, x: 0.5, y: 0.5 },
};
// the stills are 1600 x 720; where the LED wall's names sit in the 'both' still (fractions)
const PLATE = { w: 1600, h: 720, names: { x: 0.5, y: 0.255 }, event: { x: 0.5, y: 0.03 } };

/** Which rendered hero stands for a model: Arjun, or the base body (Meera and the rivals' looks). */
function heroKey(model: AvatarModel): 'meera' | 'arjun' {
  return /arjun/.test(model.model_url) ? 'arjun' : 'meera';
}

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
  /** True once both sides are synced; the arena then plays FIGHT! and fades out. */
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

  // Real opponents: their level now; their look is fixed when the arena page is built (below).
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
          look: { equipped_avatar_id: data.equipped_avatar_id, equipped_items: data.equipped_items },
          level: lv.level,
          title: lv.title,
        }));
      });
    return () => {
      active = false;
    };
  }, [mode, opponentUsername, simulatedOpponent, solo]);

  const exerciseName = EXERCISE_NAMES[String(exerciseId).replace(/_.*/, '')] || 'Workout';

  // The still for this matchup: both heroes on stage (Battle Ground: you alone, on your close-up still).
  const stageImage = useMemo(() => {
    const self = lookOf(BUNDLED_AVATARS, profile as any).model;
    const opp =
      opponent.kind === 'bot'
        ? AI_RIVAL_MODEL
        : opponent.look
          ? lookOf(BUNDLED_AVATARS, opponent.look as any).model
          : lookForName(BUNDLED_AVATARS, opponent.name || 'rival').model;
    const file = solo ? `you_${heroKey(self)}` : `both_${heroKey(self)}_${heroKey(opp)}`;
    return { uri: resolveModelUrl(`local://arena/${file}.jpg`) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponent.look, opponent.kind, solo]);
  // the matchmaking backdrop (LoadingScreen), which the intro opens on
  const hallImage = useMemo(() => ({ uri: resolveModelUrl('local://arena/both.jpg') }), []);
  useEffect(() => {
    Image.prefetch(stageImage.uri).catch(() => {});
  }, [stageImage]);

  const { width, height } = useWindowDimensions();
  const order = useMemo(() => SHOTS.filter((s) => !(solo && (s.name === 'rival' || s.name === 'you'))), [solo]);
  const [shotIdx, setShotIdx] = useState(0);
  const shot: Shot = shotAt(shotIdx, order);
  const [introDone, setIntroDone] = useState(false);
  const [showFight, setShowFight] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const plate = useRef(new Animated.Value(0)).current;
  const fightScale = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(1)).current; // the camera over the still
  const focusX = useRef(new Animated.Value(0.5)).current;
  const focusY = useRef(new Animated.Value(0.5)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const clear = useRef(new Animated.Value(0)).current; // the matchmaking hall clearing to the stage
  const shake = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);

  // Opening: the blurred matchmaking hall clears to the stage with the athletes on it.
  useEffect(() => {
    Animated.timing(clear, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [clear]);

  // Shot timeline: the camera glides between shots over the same still.
  useEffect(() => {
    const s = order[shotIdx];
    if (!s) return;
    const cam = CAMERA[s.name];
    const glide = { duration: s.name === 'stage' ? 0 : 950, easing: Easing.inOut(Easing.cubic), useNativeDriver: true };
    Animated.parallel([
      Animated.timing(zoom, { toValue: cam.zoom, ...glide }),
      Animated.timing(focusX, { toValue: cam.x, ...glide }),
      Animated.timing(focusY, { toValue: cam.y, ...glide }),
    ]).start();
    if (s.name === 'you' || s.name === 'rival') juice.play('tap');
    if (s.name === 'both') {
      setIntroDone(true);
      return;
    }
    const t = setTimeout(() => setShotIdx((i) => Math.min(i + 1, order.length - 1)), s.dur * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotIdx, order]);

  // Name plates slide in on each close-up.
  useEffect(() => {
    plate.setValue(0);
    Animated.spring(plate, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [shot, plate]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fade, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    if (!ready || !introDone || showFight) return;
    setShowFight(true);
    juice.play('fight');
    flash.setValue(0.6);
    Animated.timing(flash, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    Animated.sequence([0, 1, 2, 3, 4, 5].map((k) => Animated.timing(shake, { toValue: k % 2 ? -1 : k === 5 ? 0 : 1, duration: 55, useNativeDriver: true }))).start();
    Animated.spring(fightScale, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true }).start();
    const t = setTimeout(finish, FIGHT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, introDone]);

  const skip = () => {
    if (order[shotIdx]?.name !== 'both') setShotIdx(order.length - 1);
  };

  // the stills fill the screen ("cover"); names on the LED wall follow the same fit
  const cover = Math.max(width / PLATE.w, height / PLATE.h);
  const plateW = PLATE.w * cover;
  const plateH = PLATE.h * cover;
  const plateLeft = (width - plateW) / 2;
  const plateTop = (height - plateH) / 2;
  // keep the focus point at the screen centre: a point d from the centre lands at zoom * d + t
  const dx = Animated.multiply(Animated.add(focusX, -0.5), -plateW);
  const dy = Animated.multiply(Animated.add(focusY, -0.5), -plateH);
  const tx = Animated.multiply(dx, zoom);
  const ty = Animated.multiply(dy, zoom);
  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] });

  const youPlate = shot === 'you';
  const rivalPlate = shot === 'rival';
  const both = shot === 'both';
  const slideL = plate.interpolate({ inputRange: [0, 1], outputRange: [-320, 0] });
  const slideR = plate.interpolate({ inputRange: [0, 1], outputRange: [320, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <StatusBar hidden />
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: shakeX }, { translateX: tx }, { translateY: ty }, { scale: zoom }] }]}>
        <Image source={stageImage} style={{ position: 'absolute', left: plateLeft, top: plateTop, width: plateW, height: plateH }} />
        {/* names on the LED wall of the two-shot */}
        {!solo && (
          // the wall's names fade while the camera is in close on an athlete
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: zoom.interpolate({ inputRange: [1.05, 1.35], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
            <View style={[styles.wallLine, { left: plateLeft, width: plateW, top: plateTop + plateH * PLATE.event.y }]}>
              <GText variant="label" size={Math.round(plateH * 0.03)} style={{ color: '#FFD27A', letterSpacing: 2 }}>
                {MODE_LABELS[mode]} · {exerciseName.toUpperCase()}
              </GText>
            </View>
            <View style={[styles.wallLine, { left: plateLeft, width: plateW, top: plateTop + plateH * PLATE.names.y - plateH * 0.04 }]}>
              <GText variant="hero" size={Math.round(plateH * 0.065)} style={styles.wallName} numberOfLines={1}>{selfName.toUpperCase()}</GText>
              {!solo && (
                <>
                  <GText variant="hero" size={Math.round(plateH * 0.075)} style={[styles.wallName, { color: '#FF6A1A', marginHorizontal: plateW * 0.035 }]}>VS</GText>
                  <GText variant="hero" size={Math.round(plateH * 0.065)} style={styles.wallName} numberOfLines={1}>{opponent.name.toUpperCase()}</GText>
                </>
              )}
            </View>
          </Animated.View>
        )}
      </Animated.View>
      {/* the matchmaking hall, clearing away */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: clear.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents="none">
        <Image source={hallImage} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={3} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,6,12,0.72)' }]} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: flash }]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel="Skip intro" />

      {/* Event banner */}
      <View style={styles.banner} pointerEvents="none">
        <Slant fill="#14141C" stroke="#3A3A48" />
        <Swords size={14} color={c.accentTo} />
        <GText variant="label" size={13} style={{ color: '#FFFFFF' }}>
          OJAS CLASSIC · {MODE_LABELS[mode]} · {exerciseName.toUpperCase()}
        </GText>
      </View>

      {/* Close-up name plates */}
      {youPlate && (
        <Animated.View style={[styles.plate, styles.plateLeft, { transform: [{ translateX: slideL }] }]} pointerEvents="none">
          <Slant fill={c.accentFrom} to={c.accentTo} />
          <GText variant="label" size={12} tone="onGradient">{solo ? 'ATHLETE' : 'IN THE ORANGE CORNER'}</GText>
          <GText variant="hero" size={34} tone="onGradient" numberOfLines={1}>{selfName}</GText>
          <View style={styles.plateMeta}>
            <RankEmblem tier={rankTierFromTitle(level.title)} size={18} />
            <GText variant="label" size={12} tone="onGradient">LV {level.level} · {tierNameFromTitle(level.title)}</GText>
          </View>
        </Animated.View>
      )}
      {rivalPlate && (
        <Animated.View style={[styles.plate, styles.plateRight, { transform: [{ translateX: slideR }] }]} pointerEvents="none">
          <Slant fill="#1F4FB8" to="#3B8DFF" />
          <GText variant="label" size={12} style={{ color: '#FFFFFF', textAlign: 'right' }}>IN THE BLUE CORNER</GText>
          <GText variant="hero" size={34} numberOfLines={1} style={{ color: '#FFFFFF', textAlign: 'right' }}>{opponent.name}</GText>
          <View style={[styles.plateMeta, { justifyContent: 'flex-end' }]}>
            {opponent.kind === 'bot' && <Bot size={14} color="#FFFFFF" />}
            <GText variant="label" size={12} style={{ color: '#FFFFFF' }}>
              {[opponent.level ? `LV ${opponent.level}` : null, opponent.title].filter(Boolean).join(' · ') || 'Challenger'}
            </GText>
          </View>
        </Animated.View>
      )}

      {/* Both on stage: compact plates + VS */}
      {both && !showFight && (
        <View style={styles.bothRow} pointerEvents="none">
          <View style={styles.miniPlate}>
            <Slant fill={c.accentFrom} to={c.accentTo} />
            <GText variant="display" size={18} tone="onGradient" numberOfLines={1}>{selfName}</GText>
          </View>
          {!solo && (
            <>
              <GText variant="hero" size={40} style={styles.vs}>VS</GText>
              <View style={styles.miniPlate}>
                <Slant fill="#1F4FB8" to="#3B8DFF" />
                <GText variant="display" size={18} style={{ color: '#FFFFFF' }} numberOfLines={1}>{opponent.name}</GText>
              </View>
            </>
          )}
          {solo && (
            <View style={styles.miniPlate}>
              <Slant fill="#14141C" stroke="#3A3A48" />
              <Users size={14} color="#FFFFFF" />
              <GText variant="label" size={13} style={{ color: '#FFFFFF' }}>{Math.max(2, lobbyPlayerCount)} ATHLETES</GText>
            </View>
          )}
        </View>
      )}

      {/* Status / FIGHT */}
      <View style={styles.footer} pointerEvents="box-none">
        {showFight ? (
          <Animated.View style={{ transform: [{ scale: fightScale }, { rotate: '-6deg' }] }} pointerEvents="none">
            <GText variant="hero" size={84} style={styles.fight}>FIGHT!</GText>
          </Animated.View>
        ) : (
          <View style={styles.statusRow}>
            <View style={styles.statusPill} pointerEvents="none">
              <ActivityIndicator size="small" color="#FFFFFF" />
              <GText variant="label" size={13} style={{ color: '#FFFFFF' }} numberOfLines={1}>{statusText}</GText>
            </View>
            {!both && (
              <Pressable onPress={skip} style={styles.ghostBtn} accessibilityRole="button">
                <GText variant="label" size={13} style={{ color: '#FFFFFF' }}>Skip ›</GText>
              </Pressable>
            )}
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
  root: { backgroundColor: '#07070B', zIndex: 500, elevation: 50 },
  wallLine: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wallName: { color: '#FFFFFF', textShadowColor: 'rgba(255,120,40,0.55)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12 },
  banner: { position: 'absolute', top: 12, left: 16, height: 30, paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', gap: 8 },
  plate: { position: 'absolute', bottom: 92, paddingHorizontal: 34, paddingVertical: 10, minWidth: 300, maxWidth: '55%' },
  plateLeft: { left: 24 },
  plateRight: { right: 24, alignItems: 'flex-end' },
  plateMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  bothRow: { position: 'absolute', bottom: 86, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  miniPlate: { height: 40, minWidth: 170, paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  vs: { color: '#FFD27A', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 },
  footer: { position: 'absolute', bottom: 22, left: 0, right: 0, alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', maxWidth: 360 },
  ghostBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,0,0,0.35)' },
  fight: { color: '#FFD27A', textShadowColor: '#B53214', textShadowOffset: { width: 4, height: 4 }, textShadowRadius: 0 },
});

/** The shot shown at timeline index i ('both' once the order runs out). */
function shotAt(i: number, order: { name: Shot }[]): Shot {
  return order[Math.min(i, order.length - 1)]?.name ?? 'both';
}
