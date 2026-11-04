// Landscape lobby: the game's main menu (MLBB-style layout requested by the user, 2026-11-01).
// Centre: the player's 3D character. Top-left: profile + level. Top-right: currencies
// and icon buttons. Left: quick menu. Right: daily quests. Bottom: angled menu bar + angled play button.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, Bot, Check, ChevronDown, Clock, Coins, Dumbbell, Flame, Lock, Settings, Shirt, ShoppingBag, Swords, Trophy, User, Users, X } from 'lucide-react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { GText, MeterBar, Panel, StatChip } from '../components/game';
import { Slant } from '../components/game/Slant';
import { GradientFill } from '../components/game/Gradient';
import { ExerciseIcon } from '../components/ExerciseIcon';
import { AvatarViewer3D } from '../features/avatar/components/AvatarViewer3D';
import { LoopVideo, STORY_VIDEOS } from '../features/avatar/components/HeroScreen';
import { useCharacterCreator } from '../features/avatar/components/CharacterCreator';
import { TourTarget } from '../features/tour/TourTarget';
import { useGameStats } from '../hooks/useGameStats';
import { useDailyChallenges } from '../hooks/useDailyChallenges';
import { useEquippedLook } from '../hooks/useEquippedLook';
import { juice } from '../juice/juice';
import { useExerciseListStore } from '../store/exerciseListStore';
import { useMatchmakingStore } from '../store/matchmakingStore';
import { selectUnreadCount, useNewsStore } from '../store/newsStore';
import { SessionOrigin, useUserStore } from '../store/userStore';
import { softShadow, useColors, type Palette } from '../theme';
import { computeCoinBalance } from '../utils/gamification';
import type { ExerciseItem } from '../utils/exerciseService';
import {
  DEFAULT_LAST_PLAY,
  LAST_PLAY_KEY,
  LOBBY_MODES,
  LastPlay,
  LobbyMode,
  modeLabel,
  modeNeedsAuth,
  modeSupportsExercise,
  parseLastPlay,
  playLabel,
} from './lobbyLogic';

export type LobbyDestination = 'workouts' | 'explore' | 'shop' | 'profile' | 'news';

export interface LobbyScreenProps {
  isGuest: boolean;
  onPlay: (mode: LobbyMode, exercise: ExerciseItem) => void;
  onOpenCamera: (exerciseId?: string, exerciseName?: string, isTutor?: boolean, origin?: SessionOrigin) => void;
  onSettingsPress: () => void;
  onNavigate: (to: LobbyDestination) => void;
}

const MODE_ICONS: Record<LobbyMode, React.ComponentType<{ size?: number; color?: string }>> = {
  ai_duel: Bot,
  quick_duel: Swords,
  battle_ground: Trophy,
  solo: Dumbbell,
};

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ isGuest, onPlay, onOpenCamera, onSettingsPress, onNavigate }) => {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const exercises = useExerciseListStore((s) => s.exercises);
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const unreadNews = useNewsStore(selectUnreadCount);
  const { level, streak } = useGameStats();
  const online = useMatchmakingStore((s) => s.total_online);
  const { challenges } = useDailyChallenges(exercises);
  const look = useEquippedLook();
  const heroInfo = look.model.config.hero;
  const film = STORY_VIDEOS[look.model.id];

  const [play, setPlay] = useState<LastPlay>(DEFAULT_LAST_PLAY);
  const [hint, setHint] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resetIn, setResetIn] = useState(timeToMidnight());
  useEffect(() => {
    const t = setInterval(() => setResetIn(timeToMidnight()), 60000);
    return () => clearInterval(t);
  }, []);

  const exerciseIds = useMemo(() => exercises.map((e) => e.id), [exercises]);
  useEffect(() => {
    AsyncStorage.getItem(LAST_PLAY_KEY)
      .then((raw) => setPlay(parseLastPlay(raw, exerciseIds)))
      .catch(() => {});
    // Only on mount: later changes come from the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(t);
  }, [hint]);

  const savePlay = (next: LastPlay) => {
    setPlay(next);
    AsyncStorage.setItem(LAST_PLAY_KEY, JSON.stringify(next)).catch(() => {});
  };

  const exercise = exercises.find((e) => e.id === play.exerciseId) ?? exercises[0];
  const name = profile?.username || profile?.full_name || user?.user_metadata?.username || (isGuest ? 'Guest' : 'Athlete');
  const coins = computeCoinBalance(profile);
  const left = Math.max(insets.left, 12);
  const right = Math.max(insets.right, 12);
  const PlayIcon = MODE_ICONS[play.mode];
  const questsWidth = Math.min(270, Math.max(210, width * 0.28));
  // smaller phones in landscape: everything has to fit between the top row and the bottom bar
  const short = height < 400;
  const questsDone = challenges.filter((q) => q.isCompleted).length;

  const handlePlay = () => {
    if (!exercise) return;
    if (isGuest && modeNeedsAuth(play.mode)) setHint('Sign in to play online');
    onPlay(play.mode, exercise);
  };

  return (
    <View style={styles.root}>
      {/* Full-screen game menu, like the reference: no status bar. */}
      <StatusBar hidden />
      {!heroInfo && <ArenaBackdrop width={width} height={height} c={c} />}

      {/* The hero, glorified: big, in their own world, with a halo and light rays. A hero
          without a world stands on the arena platform in the centre. */}
      <View
        style={heroInfo ? StyleSheet.absoluteFill : [styles.stage, { left: width * 0.2, right: width * 0.28 }]}
        onTouchStart={() => juice.unlock()}
      >
        {/* a hero with a film plays it on repeat; no 3D to load */}
        {film ? <LoopVideo source={film.source} poster={film.still} webPath={film.webPath} /> : <AvatarViewer3D
          model={look.model}
          items={look.items}
          autoRotate={false}
          interactive
          lively
          platform={!heroInfo}
          world={heroInfo ? heroInfo.lobbyWorld ?? heroInfo.world : undefined}
          view={heroInfo ? 'lobby' : 'stage'}
          effectColor={heroInfo?.effect.color}
          moves={heroInfo?.lobbyMoves}
          onAction={(move, tapped) => {
            if (tapped) juice.play(move === 'squat' ? 'rep' : 'combo');
          }}
          style={StyleSheet.absoluteFill}
        />}
      </View>


      {/* Top-left: profile */}
      <TourTarget id="home-level" style={[styles.profile, { left, top: 10 }]}>
        <Pressable onPress={() => onNavigate('profile')} accessibilityRole="button" accessibilityLabel={`${name}, level ${level.level}. Open profile`} style={styles.profileRow}>
          <View style={[styles.levelBadge, softShadow(c)]}>
            <GradientFill from={c.accentFrom} to={c.accentTo} radius={24} />
            <GText variant="number" size={22} tone="onGradient">{level.level}</GText>
          </View>
          <View style={{ width: 170, gap: 3 }}>
            <GText variant="title" size={17} numberOfLines={1} style={heroInfo ? styles.onDark : undefined}>{name}</GText>
            <GText variant="caption" tone="muted" numberOfLines={1} style={heroInfo ? styles.onDarkMuted : undefined}>{level.title}</GText>
            <MeterBar value={level.progress} height={6} />
          </View>
        </Pressable>
      </TourTarget>

      {/* Top-right: currencies and icon buttons */}
      <View style={[styles.topRight, { right, top: 10 }]}>
        <StatChip icon={Coins} tone="win" value={coins} accessibilityLabel={`${coins} coins`} />
        <StatChip icon={Flame} tone="accent" value={streak.current} pulse={streak.atRisk} accessibilityLabel={`${streak.current} day streak`} />
        <StatChip icon={Users} tone="success" dot value={online} accessibilityLabel={`${online} players online`} />
        <TourTarget id="home-news">
          <IconButton icon={Bell} label="News" badge={unreadNews} onPress={() => onNavigate('news')} c={c} />
        </TourTarget>
        <IconButton icon={Settings} label="Settings" onPress={onSettingsPress} c={c} />
      </View>

      {/* Left: quick menu */}
      <View style={[styles.quickMenu, { left, top: short ? 66 : 84 }, short && { gap: 4 }]}>
        <QuickButton icon={ShoppingBag} label="Shop" onPress={() => onNavigate('shop')} c={c} onDark={!!heroInfo} compact={short} />
        {!isGuest && <QuickButton icon={Shirt} label="Avatar" onPress={() => useCharacterCreator.getState().show()} c={c} onDark={!!heroInfo} compact={short} />}
        <QuickButton icon={Trophy} label="Ranks" onPress={() => onNavigate('profile')} c={c} onDark={!!heroInfo} compact={short} />
      </View>

      {/* Right: daily quests */}
      {challenges.length > 0 && (
        <TourTarget id="lobby-quests" style={[styles.quests, { right, top: short ? 54 : 62, width: questsWidth }]}>
          <Panel tone="raised" radius={18} padding={short ? 8 : 10}>
            <View style={styles.questHead}>
              <View style={styles.questPlate}>
                <Slant fill={c.text} />
                <GText variant="label" size={12} style={{ color: c.raised }}>DAILY QUESTS</GText>
              </View>
              <GText variant="label" size={12} tone={questsDone === Math.min(3, challenges.length) ? 'winInk' : 'muted'}>
                {questsDone}/{Math.min(3, challenges.length)}
              </GText>
            </View>
            <View style={[styles.questTimer, short && { marginTop: 2, marginBottom: 2 }]}>
              <Clock size={11} color={c.textMuted} />
              <GText variant="caption" size={11} tone="muted">Resets in {resetIn}</GText>
            </View>
            {challenges.slice(0, 3).map((q) => (
              <Pressable
                key={q.id}
                onPress={() => onOpenCamera(q.exerciseId, q.exerciseName, false, 'lobby')}
                accessibilityRole="button"
                accessibilityLabel={`${q.shortGoal}, ${q.isCompleted ? 'done' : `${q.currentProgress} of ${q.targetValue}`}`}
                style={[styles.questRow, { borderColor: c.edge }, short && { paddingVertical: 3 }, q.isCompleted && { opacity: 0.55 }]}
              >
                <ExerciseIcon imageUrl={q.exercise?.image_url} icon={q.exercise?.icon} size={short ? 22 : 28} />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.questTextRow}>
                    <GText variant="caption" numberOfLines={1} style={{ flex: 1 }}>{q.shortGoal}</GText>
                    {!q.isCompleted && (
                      <GText variant="caption" size={10} tone="muted">{Math.min(q.currentProgress, q.targetValue)}/{q.targetValue}</GText>
                    )}
                  </View>
                  <MeterBar value={q.targetValue > 0 ? q.currentProgress / q.targetValue : 0} height={5} />
                </View>
                {q.isCompleted ? (
                  <View style={[styles.doneBadge, { backgroundColor: c.success }]}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3.5} />
                  </View>
                ) : (
                  <View style={[styles.xpGem, { backgroundColor: c.surfaceHi, borderColor: c.edge }]}>
                    <GText variant="label" size={11} tone="winInk">+{q.xpReward}</GText>
                  </View>
                )}
              </Pressable>
            ))}
          </Panel>
        </TourTarget>
      )}

      {/* Bottom: angled menu bar */}
      <View style={[styles.bottomBar, { left: left - 4, right: width * 0.3, bottom: Math.max(insets.bottom, 8) }, short && { height: 46 }]}>
        <Slant fill={c.raised} stroke={c.edge} />
        {(
          [
            { to: 'workouts', label: 'Train', icon: Dumbbell },
            { to: 'explore', label: 'Squad', icon: Users },
            { to: 'shop', label: 'Shop', icon: ShoppingBag },
            { to: 'profile', label: 'Profile', icon: User },
          ] as const
        ).map(({ to, label, icon: Icon }, i) => (
          <React.Fragment key={to}>
            {i > 0 && <View style={[styles.divider, { backgroundColor: c.borderStrong }]} />}
            <TourTarget id={`tab-${to}`} style={[styles.barItem, short && { height: 46 }]}>
            <Pressable
              style={styles.barItemInner}
              onPress={() => {
                juice.play('toggle');
                onNavigate(to);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon size={20} color={c.accent} />
              <GText variant="title" size={16}>{label}</GText>
            </Pressable>
            </TourTarget>
          </React.Fragment>
        ))}
      </View>

      {/* Bottom-right: mode/exercise selector + angled play button */}
      <TourTarget id="lobby-play" style={[styles.playArea, { right, bottom: Math.max(insets.bottom, 8), width: width * 0.28 }]}>
        {hint && <GText variant="caption" tone="muted" style={styles.hint}>{hint}</GText>}
        <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" accessibilityLabel={`Mode ${modeLabel(play.mode)}, exercise ${exercise?.name}. Change`}>
          <Panel tone="raised" radius={16} padding={8} style={styles.modeCard}>
            <PlayIcon size={18} color={c.accent} />
            <GText variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {modeLabel(play.mode)} · {exercise?.name ?? ''}
            </GText>
            <ChevronDown size={16} color={c.textMuted} />
          </Panel>
        </Pressable>
        <Pressable onPress={handlePlay} accessibilityRole="button" accessibilityLabel={playLabel(play.mode)} style={({ pressed }) => [styles.playButton, short && { height: 54 }, pressed && { transform: [{ translateY: 2 }] }]}>
          <Slant fill={c.accentLip} offsetY={4} />
          <View style={styles.playFace}>
            <Slant fill={c.accentFrom} to={c.accentTo} />
            <GText variant="hero" size={30} tone="onGradient" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1}>
              {playLabel(play.mode)}
            </GText>
          </View>
        </Pressable>
      </TourTarget>

      <ModePickerSheet
        visible={pickerOpen}
        exercises={exercises}
        play={play}
        isGuest={isGuest}
        onClose={() => setPickerOpen(false)}
        onChange={(next, message) => {
          if (message) setHint(message);
          savePlay(next);
        }}
      />
    </View>
  );
};

/** Time left until local midnight, when daily quests reset (e.g. "5h 12m"). */
function timeToMidnight(): string {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** Arena backdrop: a warm glow and light rays behind the character, a floor, soft orbs at the edges. */
const ArenaBackdrop: React.FC<{ width: number; height: number; c: Palette }> = ({ width, height, c }) => {
  const cx = width * 0.46;
  const rays = [-0.34, -0.17, 0, 0.17, 0.34];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="lobbyGlow" cx={cx} cy={height * 0.5} r={height * 0.62} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={c.accentTo} stopOpacity={0.32} />
          <Stop offset="0.55" stopColor={c.accentFrom} stopOpacity={0.08} />
          <Stop offset="1" stopColor={c.accentFrom} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="lobbyFloor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.raised} stopOpacity={0.9} />
          <Stop offset="1" stopColor={c.raised} stopOpacity={0.2} />
        </LinearGradient>
      </Defs>
      {/* light rays fanning down from above the character */}
      {rays.map((a, i) => (
        <Polygon
          key={i}
          points={`${cx + a * width * 0.15},-10 ${cx + a * width * 0.15 + 18},-10 ${cx + a * width * 0.9 + 60},${height} ${cx + a * width * 0.9 - 40},${height}`}
          fill="#FFFFFF"
          opacity={0.13}
        />
      ))}
      <Circle cx={cx} cy={height * 0.5} r={height * 0.62} fill="url(#lobbyGlow)" />
      <Ellipse cx={cx} cy={height * 1.02} rx={width * 0.42} ry={height * 0.3} fill="url(#lobbyFloor)" />
      <Circle cx={width * 0.1} cy={height * 0.88} r={height * 0.16} fill={c.accentTo} opacity={0.1} />
      <Circle cx={width * 0.88} cy={height * 0.82} r={height * 0.12} fill={c.rival} opacity={0.08} />
    </Svg>
  );
};

const IconButton: React.FC<{ icon: React.ComponentType<{ size?: number; color?: string }>; label: string; badge?: number; onPress: () => void; c: Palette }> = ({
  icon: Icon,
  label,
  badge = 0,
  onPress,
  c,
}) => (
  <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconButton, { backgroundColor: c.raised, borderColor: c.edge }, softShadow(c)]}>
    <Icon size={18} color={c.text} />
    {badge > 0 && (
      <View style={[styles.badge, { backgroundColor: c.danger }]}>
        <GText variant="label" size={10} style={{ color: '#FFFFFF' }}>{badge > 9 ? '9+' : badge}</GText>
      </View>
    )}
  </Pressable>
);

const QuickButton: React.FC<{ compact?: boolean; icon: React.ComponentType<{ size?: number; color?: string }>; label: string; onPress: () => void; c: Palette; onDark?: boolean }> = ({ icon: Icon, label, onPress, c, onDark, compact }) => (
  <Pressable
    onPress={() => {
      juice.play('tap');
      onPress();
    }}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={styles.quickButton}
  >
    <View style={[styles.quickIcon, { backgroundColor: c.raised, borderColor: c.edge }, compact && { width: 38, height: 38, borderRadius: 13 }, softShadow(c)]}>
      <Icon size={compact ? 19 : 22} color={c.accent} />
    </View>
    <GText variant="label" style={onDark ? styles.onDark : undefined}>{label}</GText>
  </Pressable>
);

const ModePickerSheet: React.FC<{
  visible: boolean;
  exercises: ExerciseItem[];
  play: LastPlay;
  isGuest: boolean;
  onClose: () => void;
  onChange: (next: LastPlay, message?: string) => void;
}> = ({ visible, exercises, play, isGuest, onClose, onChange }) => {
  const c = useColors();
  const { height } = useWindowDimensions();
  const pickMode = (mode: LobbyMode) => {
    const msg = isGuest && modeNeedsAuth(mode) ? 'Sign in to play online' : undefined;
    if (!modeSupportsExercise(mode, play.exerciseId)) onChange({ mode, exerciseId: '1' }, 'AI duel: squats only');
    else onChange({ ...play, mode }, msg);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Panel tone="raised" radius={24} padding={16} style={[styles.sheet, { maxHeight: height - 40 }]}>
          <View style={styles.sheetHeader}>
            <GText variant="title" style={{ flex: 1 }}>Choose your battle</GText>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <X size={20} color={c.text} />
            </Pressable>
          </View>
          <View style={styles.sheetColumns}>
            <View style={styles.sheetModes}>
              {LOBBY_MODES.map((mode) => {
                const Icon = MODE_ICONS[mode];
                const selected = play.mode === mode;
                const locked = isGuest && modeNeedsAuth(mode);
                return (
                  <Pressable
                    key={mode}
                    onPress={() => pickMode(mode)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[styles.modeRow, { borderColor: selected ? c.accentFrom : c.edge, backgroundColor: selected ? c.surfaceHi : 'transparent' }]}
                  >
                    <Icon size={20} color={c.accent} />
                    <GText variant="bodyStrong" style={{ flex: 1 }}>{modeLabel(mode)}</GText>
                    {locked && <Lock size={14} color={c.textMuted} />}
                    {selected && <Check size={18} color={c.accent} />}
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={styles.sheetExercises}>
              {exercises.map((ex) => {
                const ok = modeSupportsExercise(play.mode, ex.id);
                const selected = ex.id === play.exerciseId;
                return (
                  <Pressable
                    key={ex.id}
                    onPress={() => (ok ? onChange({ ...play, exerciseId: ex.id }) : onChange(play, 'AI duel: squats only'))}
                    style={[styles.exerciseRow, { borderColor: c.edge, opacity: ok ? 1 : 0.45 }, selected && { backgroundColor: c.surfaceHi }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <ExerciseIcon imageUrl={ex.image_url} icon={ex.icon} size={26} />
                    <GText variant="bodyStrong" style={{ flex: 1 }}>{ex.name}</GText>
                    {!ok && <Lock size={14} color={c.textMuted} />}
                    {selected && <Check size={18} color={c.accent} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Panel>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  // text straight on the hero's world (night track, dusk trail)
  onDark: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 7 },
  onDarkMuted: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 7 },
  stage: { position: 'absolute', top: 10, bottom: 74 },
  profile: { position: 'absolute' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  levelBadge: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  topRight: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  quickMenu: { position: 'absolute', gap: 10 },
  quickButton: { alignItems: 'center', gap: 3, width: 64 },
  quickIcon: { width: 46, height: 46, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quests: { position: 'absolute' },
  questHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questPlate: { height: 24, paddingHorizontal: 14, justifyContent: 'center' },
  questTimer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 4 },
  questTextRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  doneBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  xpGem: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1 },
  bottomBar: { position: 'absolute', height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18 },
  barItemInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  barItem: { flex: 1, height: 52 },
  divider: { width: 2, height: 24, borderRadius: 1, transform: [{ rotate: '12deg' }] },
  playArea: { position: 'absolute', gap: 6 },
  hint: { textAlign: 'right' },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  playButton: { height: 64 },
  playFace: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheetWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 720 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sheetColumns: { flexDirection: 'row', gap: 16, flexShrink: 1 },
  sheetModes: { width: 220, gap: 8 },
  modeRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  sheetExercises: { flex: 1 },
  exerciseRow: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderRadius: 10 },
});
