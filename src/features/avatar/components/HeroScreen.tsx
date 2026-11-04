// A hero's own screen. It opens on their story movie: a rendered film where the hero has one
// (STORY_VIDEOS), otherwise full screen and letterboxed, the camera cutting between live shots of the
// hero running or hiking through their world. Captions tell the story,
// ending on a title card. Then it settles into the hero showcase: the hero keeps moving through their
// world, side-on, with their name, role, stats and signature moves down the left, and the play / buy
// button below. Story replays the movie; Skip jumps to the showcase.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { WebView } from 'react-native-webview';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Check, ChevronLeft, ChevronRight, Clapperboard, Dumbbell, Flag, Footprints, Lock, Mountain, Sparkles, Zap } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { GradientFill } from '../../../components/game/Gradient';
import { Slant } from '../../../components/game/Slant';
import { juice } from '../../../juice/juice';
import { AvatarViewer3D, StoryShot } from './AvatarViewer3D';
import { CoinDot, RARITY_COLORS } from './AvatarShopScreen';
import { AvatarModel, LOCAL_ASSET_ORIGIN, equipAvatar, getLoadout, loadoutItems, purchaseAvatar, resolveModelUrl } from '../../../utils/avatarShopService';
import { XP_PER_COIN } from '../../../utils/gamification';
import { useUserStore } from '../../../store/userStore';
import { useColors } from '../../../theme';

/** A dark wash from the left edge, fading out, so the text column reads over the world. */
const Wash: React.FC = () => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={styles.wash} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="heroWash" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#04060F" stopOpacity={0.85} />
              <Stop offset="0.6" stopColor="#04060F" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#04060F" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#heroWash)" />
        </Svg>
      )}
    </View>
  );
};

// The Android emulator's H.264 decoder (c2.goldfish) outputs black or green frames, so emulators get
// AV1 copies, which they decode in software. Phones keep H.264, which they decode in hardware.
const IS_EMULATOR = Platform.OS === 'android' && /sdk_gphone|emulator|android sdk built/i.test(Platform.constants.Model);

// Heroes with a finished film: seconds for its captions, and when the title card comes in.
// still: the hero's picture from the film, shown behind the hero screen and the Avatar screen once the
// film is over. moves: the parts of the film each signature move plays, in seconds.
export const STORY_VIDEOS: Record<string, {
  source: number;
  captions: { from: number; to: number; text: string }[];
  titleAt: number;
  still: number;
  /** The film in the web assets, for playing it in a WebView on emulators. */
  webPath: string;
  moves: Record<string, { from: number; to: number }>;
}> = {
  starter_ojas: {
    source: IS_EMULATOR ? require('../../../../assets/video/arjun_story_av1.mp4') : require('../../../../assets/video/arjun_story.mp4'),
    captions: [
      { from: 0.2, to: 3.3, text: 'The last stretch to the summit is straight up.' },
      { from: 3.5, to: 5.5, text: 'Arjun never looks down.' },
    ],
    titleAt: 5.8,
    still: require('../../../../assets/video/arjun_still.jpg'),
    webPath: 'video/arjun_story.mp4',
    moves: { hero_move1: { from: 0, to: 3.45 }, hero_move2: { from: 4.6, to: 7.9 } },
  },
  starter_ojas_f: {
    source: IS_EMULATOR ? require('../../../../assets/video/meera_story_av1.mp4') : require('../../../../assets/video/meera_story.mp4'),
    captions: [
      { from: 0.2, to: 2.85, text: 'Every race, she was first off the line.' },
      { from: 3.1, to: 5.25, text: 'A knee injury only slowed her down.' },
    ],
    titleAt: 5.9,
    still: require('../../../../assets/video/meera_still.jpg'),
    webPath: 'video/meera_story.mp4',
    moves: { hero_move1: { from: 0, to: 2.95 }, hero_move2: { from: 5.4, to: 8 } },
  },
};

/** The hero's film, filling the screen, with timed captions and the title card over its last shot.
 * onEnd fires when it finishes or can't play, so the hero's screen is never held up. */
const StoryVideo: React.FC<{
  film: (typeof STORY_VIDEOS)[string];
  title: React.ReactNode;
  onStart: () => void;
  onEnd: () => void;
}> = ({ film, title, onStart, onEnd }) => {
  const player = useVideoPlayer(film.source, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  // only caption changes re-render: re-rendering the video view on every tick isn't free
  const [shown, setShown] = useState(-1);
  const [showTitle, setShowTitle] = useState(false);
  const started = useRef(false);
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const subs = [
      player.addListener('timeUpdate', (e) => {
        // playback has started: the first-frame event isn't reliable on a texture view
        if (e.currentTime > 0 && !started.current) {
          started.current = true;
          onStart();
        }
        setShown(film.captions.findIndex((c) => e.currentTime >= c.from && e.currentTime < c.to));
        setShowTitle(e.currentTime >= film.titleAt);
      }),
      player.addListener('playToEnd', onEnd),
      player.addListener('statusChange', (e) => {
        if (e.status === 'error') onEnd();
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    fadeIn.setValue(0);
    Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [shown, showTitle, fadeIn]);

  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {shown >= 0 && !showTitle && (
        <Animated.View style={[styles.filmCaption, { opacity: fadeIn }]} pointerEvents="none">
          <GText variant="body" size={18} style={styles.captionText}>{film.captions[shown].text}</GText>
        </Animated.View>
      )}
      {showTitle && (
        <Animated.View
          style={[styles.titleCard, { opacity: fadeIn, transform: [{ scale: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }] }]}
          pointerEvents="none"
        >
          {title}
        </Animated.View>
      )}
    </>
  );
};

/** The lobby's background: the hero's film on repeat, silent, with no captions. */
export const LoopVideo: React.FC<{ source: number; poster?: number; webPath?: string }> = ({ source, poster, webPath }) => {
  const fill = [StyleSheet.absoluteFill, { width: '100%' as const, height: '100%' as const }];
  // The emulator's native video path blinks black; a WebView has its own, so it plays there.
  const inWebView = IS_EMULATOR && !!webPath;
  return (
    <>
      {poster != null && <Image source={poster} style={fill} resizeMode="cover" />}
      {inWebView ? <WebLoop path={webPath!} /> : <NativeLoop source={source} />}
    </>
  );
};

const NativeLoop: React.FC<{ source: number }> = ({ source }) => {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} surfaceType="textureView" />;
};

// The asset server has no range requests: fetch the whole clip, then loop it from memory.
const WebLoop: React.FC<{ path: string }> = ({ path }) => (
  <WebView
    source={{
      baseUrl: LOCAL_ASSET_ORIGIN,
      html: `<!DOCTYPE html><html><body style="margin:0;background:transparent;overflow:hidden"><video id="v" muted loop playsinline style="position:fixed;inset:0;width:100%;height:100%;object-fit:cover"></video><script>
fetch(${JSON.stringify(`${LOCAL_ASSET_ORIGIN}/${path}`)}).then(function (r) { return r.blob(); }).then(function (b) { var v = document.getElementById('v'); v.src = URL.createObjectURL(b); v.play(); });
</script></body></html>`,
    }}
    style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}
    containerStyle={{ backgroundColor: 'transparent' }}
    originWhitelist={['*']}
    javaScriptEnabled
    mediaPlaybackRequiresUserAction={false}
    allowsInlineMediaPlayback
    mixedContentMode="always"
    scrollEnabled={false}
    overScrollMode="never"
    androidLayerType="hardware"
    pointerEvents="none"
  />
);

/** A signature move: one part of the hero's film, played over the loop, then gone. */
const MoveClip: React.FC<{ source: number; from: number; to: number; onEnd: () => void }> = ({ source, from, to, onEnd }) => {
  const player = useVideoPlayer(source, (p) => {
    p.timeUpdateEventInterval = 0.1;
    p.currentTime = from;
    p.play();
  });
  useEffect(() => {
    const subs = [
      player.addListener('timeUpdate', (e) => {
        if (e.currentTime >= to) onEnd();
      }),
      player.addListener('playToEnd', onEnd),
      player.addListener('statusChange', (e) => {
        if (e.status === 'error') onEnd();
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
};

export type HeroStatus = 'playing' | 'owned' | 'unlocked' | 'level' | 'buy';

const MOVE_ICONS: Record<string, typeof Zap> = { zap: Zap, flag: Flag, mountain: Mountain, footprints: Footprints, dumbbell: Dumbbell };
const BAR = 0.12; // letterbox bars, share of the screen height

interface HeroScreenProps {
  hero: AvatarModel;
  status: HeroStatus;
  catalog: AvatarModel[];
  coins: number;
  level: number;
  onClose: () => void;
}

export const HeroScreen: React.FC<HeroScreenProps> = ({ hero, status, catalog, coins, level, onClose }) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const profile = useUserStore((s) => s.profile);
  const isGuest = useUserStore((s) => s.isGuest);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const info = hero.config.hero;
  const [from, to] = hero.config.cardColors ?? ['#4F6BD8', '#1A2250'];
  const tint = info?.effect.color ?? from;
  const film = STORY_VIDEOS[hero.id];
  const short = useWindowDimensions().height < 400;

  const [phase, setPhase] = useState<'story' | 'show'>(info?.movie?.length ? 'story' : 'show');
  const [storyKey, setStoryKey] = useState(1);
  const [shot, setShot] = useState(-1);
  const [move, setMove] = useState<{ clip: string; key: number } | null>(null);
  const [filmMove, setFilmMove] = useState<{ from: number; to: number; key: number } | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const stageItems = useMemo(() => loadoutItems(catalog, getLoadout(profile, hero.id), hero), [catalog, profile, hero]);
  const story = useMemo(
    () => (phase === 'story' && info && !film ? { shots: info.movie.map(({ caption: _c, ...s }) => s as StoryShot), key: storyKey } : null),
    [phase, info, film, storyKey],
  );

  // fades: the movie opens from black; captions and the title card fade in; the showcase UI fades in
  const black = useRef(new Animated.Value(1)).current;
  const caption = useRef(new Animated.Value(0)).current;
  const ui = useRef(new Animated.Value(phase === 'show' ? 1 : 0)).current;
  const bars = useRef(new Animated.Value(phase === 'story' ? 1 : 0)).current;

  const fade = (v: Animated.Value, toValue: number, duration: number, delay = 0) =>
    Animated.timing(v, { toValue, duration, delay, easing: Easing.out(Easing.quad), useNativeDriver: true });

  const startStory = () => {
    juice.play('tap');
    black.setValue(1);
    ui.setValue(0);
    bars.setValue(1);
    setShot(-1);
    setPhase('story');
    setStoryKey((k) => k + 1);
  };

  const finishing = useRef(false);
  const finishStory = () => {
    if (finishing.current) return;
    finishing.current = true;
    // a quick dip to black, then the showcase
    Animated.sequence([fade(black, 1, 260), fade(black, 0, 520, 80)]).start();
    setTimeout(() => {
      finishing.current = false;
      setPhase('show');
      bars.setValue(0);
      caption.setValue(0);
      fade(ui, 1, 600, 150).start();
    }, 280);
  };

  // a film carries its own sound: the music dips while it plays, and a film that never starts moves on
  const filmPlaying = phase === 'story' && !!film;
  useEffect(() => {
    if (!filmPlaying) return;
    juice.music.duck(true);
    const watchdog = setTimeout(finishStory, 15000);
    return () => {
      clearTimeout(watchdog);
      juice.music.duck(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmPlaying, storyKey]);

  const onStory = (e: { event: 'shot'; index: number } | { event: 'end' }) => {
    if (e.event === 'end') {
      finishStory();
      return;
    }
    if (e.index === 0) fade(black, 0, 900).start();
    setShot(e.index);
    caption.setValue(0);
    fade(caption, 1, 700, 250).start();
  };

  // Android back: skip the movie, then leave the hero
  const onBackPress = () => {
    if (phase === 'story') finishStory();
    else onClose();
  };

  // ---------------------------------------------------------------- play / buy / claim
  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, failTitle: string) => {
    setIsBusy(true);
    const result = await action();
    if (result.ok) {
      useUserStore.getState().noteEquipped(hero.id);
      await refreshProfile();
    } else Alert.alert(failTitle, result.error || 'Please try again.');
    setIsBusy(false);
    return result.ok;
  };
  const handleBuy = () => {
    if (hero.notOnServer) {
      Alert.alert('Coming soon', `${hero.name} goes on sale once the shop update is installed on the server.`);
      return;
    }
    if (coins < hero.price_coins) {
      Alert.alert(
        'Not enough coins',
        `${hero.name} costs ${hero.price_coins} coins and you have ${coins}. Earn ${hero.price_coins - coins} more by training: every ${XP_PER_COIN} XP gives you 1 coin.`,
      );
      return;
    }
    Alert.alert(`Recruit ${hero.name}?`, `This spends ${hero.price_coins} of your ${coins} coins.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          if (await run(() => purchaseAvatar(hero.id), 'Purchase failed')) {
            juice.play('level_up');
            Alert.alert('New hero', `${hero.name} joined your roster and is your hero now.`);
          }
        },
      },
    ]);
  };
  const handleClaim = async () => {
    if (hero.notOnServer) {
      Alert.alert('Coming soon', `${hero.name} unlocks once the shop update is installed on the server.`);
      return;
    }
    if (await run(() => equipAvatar(hero.id), 'Could not unlock')) {
      juice.play('level_up');
      Alert.alert('Unlocked', `Level ${hero.unlock_level} reward: ${hero.name} is your hero now.`);
    }
  };

  const affordable = coins >= hero.price_coins;
  let label = '';
  let onAction: (() => void) | null = null;
  let tone: 'accent' | 'muted' | 'locked' = 'accent';
  let price = false;
  if (isBusy) tone = 'muted';
  else if (status === 'playing') {
    label = 'In use';
    tone = 'muted';
  } else if (isGuest) {
    label = 'Sign in';
    tone = 'muted';
  } else if (status === 'owned') {
    label = 'Play';
    onAction = () => run(() => equipAvatar(hero.id), 'Could not switch');
  } else if (status === 'unlocked') {
    label = 'Claim';
    onAction = handleClaim;
  } else if (status === 'level') {
    label = `Lv ${hero.unlock_level}`;
    tone = 'locked';
    onAction = () => Alert.alert('Locked', `${hero.name} unlocks at level ${hero.unlock_level}. You are level ${level}: keep training to get there.`);
  } else {
    price = true;
    tone = affordable ? 'accent' : 'locked';
    onAction = handleBuy;
  }
  const face = tone === 'accent' ? [colors.accentFrom, colors.accentTo] : tone === 'locked' ? ['#7C8597', '#5D6576'] : ['#465066', '#353D50'];

  const line = info && shot >= 0 ? info.movie[shot] : null;
  const titleCard = line && !line.caption;

  // A modal over everything, system bars included: the movie and the showcase are full screen.
  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onBackPress}
    >
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#05060C' }]} />
      {/* A hero with a film has no 3D world */}
      {!film && (
        <AvatarViewer3D
          model={hero}
          items={stageItems}
          autoRotate={false}
          interactive={false}
          world={info?.world}
          view={phase === 'story' ? 'stage' : 'showcase'}
          story={story}
          onStory={onStory}
          effectColor={tint}
          move={move}
          style={StyleSheet.absoluteFill}
        />
      )}

      {film && phase === 'show' && <Image source={film.still} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />}
      {film && phase === 'show' && filmMove && (
        <MoveClip key={filmMove.key} source={film.source} from={filmMove.from} to={filmMove.to} onEnd={() => setFilmMove(null)} />
      )}

      {phase === 'story' ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {film && (
            <StoryVideo
              key={storyKey}
              film={film}
              onStart={() => fade(black, 0, 500).start()}
              onEnd={finishStory}
              title={
                <>
                  <GText variant="label" size={14} style={{ color: tint, letterSpacing: 4 }}>{info?.role.toUpperCase()}</GText>
                  <GText variant="hero" size={76} style={styles.titleName}>{hero.name}</GText>
                  <View style={[styles.titleRule, { backgroundColor: tint }]} />
                  <GText variant="display" size={20} style={{ color: '#FFFFFF' }}>{info?.title}</GText>
                </>
              }
            />
          )}
          {/* letterbox (live movies only) */}
          {!film && <Animated.View style={[styles.bar, { top: 0, height: `${BAR * 100}%`, opacity: bars }]} />}
          {!film && <Animated.View style={[styles.bar, { bottom: 0, height: `${BAR * 100}%`, opacity: bars }]} />}
          {/* caption, over the lower bar */}
          {line && !titleCard && (
            <Animated.View style={[styles.captionWrap, { opacity: caption, transform: [{ translateY: caption.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]} pointerEvents="none">
              <GText variant="body" size={18} style={styles.captionText}>{line.caption}</GText>
            </Animated.View>
          )}
          {/* title card on the last shot */}
          {titleCard && (
            <Animated.View style={[styles.titleCard, { opacity: caption, transform: [{ scale: caption.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) }] }]} pointerEvents="none">
              <GText variant="label" size={14} style={{ color: tint, letterSpacing: 4 }}>{info?.role.toUpperCase()}</GText>
              <GText variant="hero" size={76} style={styles.titleName}>{hero.name}</GText>
              <View style={[styles.titleRule, { backgroundColor: tint }]} />
              <GText variant="display" size={20} style={{ color: '#FFFFFF' }}>{info?.title}</GText>
            </Animated.View>
          )}
          <Pressable
            onPress={() => {
              juice.play('tap');
              finishStory();
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip the story"
            hitSlop={10}
            style={[styles.skip, { top: insets.top + 14, right: Math.max(insets.right, 16) + 4 }]}
          >
            <GText variant="label" size={13} style={{ color: '#FFFFFF', letterSpacing: 2 }}>SKIP</GText>
            <ChevronRight size={16} color="#FFFFFF" strokeWidth={3} />
          </Pressable>
        </View>
      ) : (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: ui }]} pointerEvents="box-none">
          {/* a soft dark wash behind the text column */}
          <Wash />

          <Pressable
            onPress={() => {
              juice.play('tap');
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Back to heroes"
            hitSlop={8}
            style={[styles.back, { top: insets.top + 12, left: Math.max(insets.left, 16) }]}
          >
            <ChevronLeft size={26} color="#FFFFFF" strokeWidth={3} />
          </Pressable>
          <View style={[styles.coins, { top: insets.top + 14, right: Math.max(insets.right, 16) }]}>
            <CoinDot size={16} />
            <GText variant="display" size={16} style={{ color: '#FFFFFF' }}>{coins.toLocaleString()}</GText>
          </View>

          <View style={[styles.left, { left: Math.max(insets.left, 16) + 12, top: insets.top + (short ? 50 : 64) }]}>
            <View style={styles.nameRow}>
              <GText variant="hero" size={short ? 30 : 40} numberOfLines={1} style={{ color: '#FFFFFF' }}>{hero.name}</GText>
              <View style={[styles.rarity, { borderColor: RARITY_COLORS[hero.rarity] }]}>
                <GText variant="label" size={10} style={{ color: RARITY_COLORS[hero.rarity], letterSpacing: 1 }}>{hero.rarity.toUpperCase()}</GText>
              </View>
            </View>
            {info && (
              <>
                <GText variant="label" size={15} style={{ color: 'rgba(225,235,255,0.9)' }}>{info.role}</GText>
                {!short && <GText variant="caption" style={{ color: 'rgba(200,215,255,0.7)' }}>{info.specialty}</GText>}
                <GText variant="label" size={14} style={{ color: tint, marginTop: short ? 1 : 4 }}>{info.title}</GText>

                <View style={[styles.stats, short && { marginTop: 6, gap: 3 }]}>
                  {info.stats.map((st) => (
                    <View key={st.label} style={styles.statRow}>
                      <GText variant="caption" style={styles.statLabel}>{st.label}</GText>
                      <View style={styles.statTrack}>
                        <View style={[styles.statFill, { width: `${Math.round(st.value * 100)}%`, backgroundColor: tint }]} />
                      </View>
                    </View>
                  ))}
                </View>

                {/* on a short screen Story joins the moves' row */}
                <View style={short && styles.movesRow}>
                <View style={[styles.moves, short && { marginTop: 0 }]}>
                  {info.moves.filter((m) => !film || film.moves[m.clip]).map((m) => {
                    const Icon = MOVE_ICONS[m.icon] ?? Sparkles;
                    return (
                      <Pressable
                        key={m.name}
                        onPress={() => {
                          juice.play('tap');
                          if (film) setFilmMove({ ...film.moves[m.clip], key: Date.now() });
                          else setMove({ clip: m.clip, key: Date.now() });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${m.name}: ${m.text}`}
                        style={({ pressed }) => [styles.move, pressed && { transform: [{ scale: 0.92 }] }]}
                      >
                        <View style={[styles.moveIcon, short && { width: 44, height: 44, borderRadius: 22 }, { borderColor: tint, boxShadow: `0 0 12px ${tint}88` }]}>
                          <GradientFill from={`${from}`} to={`${to}`} direction="vertical" radius={short ? 22 : 27} />
                          <Icon size={short ? 20 : 24} color="#FFFFFF" strokeWidth={2.4} />
                        </View>
                        <GText variant="label" size={11} numberOfLines={1} style={styles.moveName}>{m.name}</GText>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={[styles.extras, short && { marginTop: 0 }]}>
                  <Pressable onPress={startStory} accessibilityRole="button" accessibilityLabel="Watch the story" style={styles.extra}>
                    <Clapperboard size={18} color="rgba(225,235,255,0.9)" />
                    <GText variant="label" size={11} style={styles.extraText}>Story</GText>
                  </Pressable>
                  {!film && (
                    <View style={styles.extra}>
                      <Sparkles size={18} color={tint} />
                      <GText variant="label" size={11} style={styles.extraText}>{info.effect.name}</GText>
                    </View>
                  )}
                </View>
                </View>
              </>
            )}
          </View>

          {/* the hero's look, as the card on the right */}
          {hero.config.card && (
            <View style={[styles.lookCard, short && { width: 88, height: 132 }, { right: Math.max(insets.right, 16) + 8, top: insets.top + (short ? 52 : 70), borderColor: tint }]}>
              <GradientFill from="#3B4E9E" to="#0C1236" direction="vertical" radius={10} />
              <Image source={{ uri: resolveModelUrl(hero.config.card) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={styles.lookLabel}>
                {status === 'playing' && <Check size={12} color="#FFFFFF" strokeWidth={3.5} />}
                <GText variant="label" size={11} style={{ color: '#FFFFFF' }}>Default look</GText>
              </View>
            </View>
          )}

          {/* play / buy */}
          {/* in the corner over footage, so it doesn't cover the hero standing in the shot */}
          <View style={[styles.actionWrap, film && { alignItems: 'flex-end', paddingRight: Math.max(insets.right, 16) + 8 }, { bottom: insets.bottom + 18 }]} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                if (!onAction) return;
                juice.play('tap');
                onAction();
              }}
              disabled={!onAction}
              accessibilityRole="button"
              accessibilityLabel={price ? `Buy for ${hero.price_coins} coins` : label}
              style={({ pressed }) => [styles.action, pressed && { transform: [{ translateY: 2 }] }]}
            >
              {tone !== 'muted' && <Slant fill={tone === 'accent' ? colors.accentLip : '#454C5B'} offsetY={4} />}
              <View style={styles.actionFace}>
                <Slant fill={face[0]} to={face[1]} stroke={tone === 'muted' ? 'rgba(255,255,255,0.35)' : undefined} />
                {isBusy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : price ? (
                  <>
                    {!affordable && <Lock size={16} color="#FFFFFF" strokeWidth={3} />}
                    <CoinDot size={18} />
                    <GText variant="hero" size={22} style={{ color: tone === 'accent' ? colors.onGradient : '#FFFFFF' }}>{hero.price_coins.toLocaleString()}</GText>
                  </>
                ) : (
                  <>
                    {status === 'playing' && <Check size={18} color="#FFFFFF" strokeWidth={3} />}
                    {status === 'level' && <Lock size={16} color="#FFFFFF" strokeWidth={3} />}
                    <GText variant="hero" size={22} numberOfLines={1} style={{ color: tone === 'accent' ? colors.onGradient : '#FFFFFF', flexShrink: 0 }}>{label.toUpperCase()}</GText>
                  </>
                )}
              </View>
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* fade to and from black */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: black }]} pointerEvents="none" />
    </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, backgroundColor: '#000000' },
  filmCaption: { position: 'absolute', left: '12%', right: '12%', bottom: '8%', alignItems: 'center' },
  captionWrap: { position: 'absolute', left: '12%', right: '12%', bottom: '14.5%', alignItems: 'center' },
  captionText: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  titleCard: { position: 'absolute', left: '7%', top: '24%' },
  titleName: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 12 },
  titleRule: { width: 90, height: 5, borderRadius: 3, marginVertical: 8 },
  skip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  wash: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '46%' },
  back: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,14,34,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(170,200,255,0.4)',
  },
  coins: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10,14,34,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(170,200,255,0.35)',
  },
  left: { position: 'absolute', width: 320 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rarity: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  stats: { marginTop: 12, gap: 7 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { width: 62, color: 'rgba(225,235,255,0.85)' },
  statTrack: { width: 150, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  statFill: { height: 5, borderRadius: 3 },
  moves: { flexDirection: 'row', gap: 8, marginTop: 16 },
  movesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  move: { alignItems: 'center', width: 84, gap: 4 },
  moveIcon: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  moveName: { color: '#FFFFFF', textAlign: 'center' },
  extras: { flexDirection: 'row', gap: 18, marginTop: 12 },
  extra: { alignItems: 'center', gap: 2, minWidth: 44 },
  extraText: { color: 'rgba(225,235,255,0.85)' },
  lookCard: { position: 'absolute', width: 112, height: 168, borderRadius: 10, borderWidth: 2, overflow: 'hidden' },
  lookLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(11,16,48,0.8)',
  },
  actionWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  action: { width: 240, height: 56 },
  actionFace: { height: 52, paddingHorizontal: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
