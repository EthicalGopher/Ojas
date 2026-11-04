import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { AlertTriangle } from 'lucide-react-native';
import { getAvatarViewerHtml } from '../avatarViewerHtml';
import { AvatarModel, LOCAL_ASSET_ORIGIN, resolveModelUrl, viewerConfig } from '../../../utils/avatarShopService';
import { useColors } from '../../../theme';

interface AvatarViewer3DProps {
  model: AvatarModel;
  /** Top / pants / shoes / hair / accessory items worn on the model. */
  items?: AvatarModel[];
  style?: StyleProp<ViewStyle>;
  autoRotate?: boolean;
  /** Drag to spin the model. */
  interactive?: boolean;
  /** Starting turn in radians, e.g. to face a rival on the VS screen. */
  initialYaw?: number;
  /** Lobby mode: warm-up loop, random moves, and a reaction when tapped. */
  lively?: boolean;
  /** Stand on a game arena platform with a glowing ring. */
  platform?: boolean;
  /** A one-off move started (cheer, squat, rest); `tapped` when the player tapped the character. */
  onAction?: (name: string, tapped: boolean) => void;
  /** Hero effect colour: tints the platform ring and adds sparks to `move`. */
  effectColor?: string;
  /** Plays this clip once each time `key` changes (a hero's signature move). */
  move?: { clip: string; key: number } | null;
  /** The hero's world around them (track, trail), sliding past as they run or hike. */
  world?: string;
  /** Camera: the default stage, the hero showcase (side-on, hero right of centre), or the lobby
   * (the hero big, knees up, with a halo and light rays in the effect colour). */
  view?: 'stage' | 'showcase' | 'lobby';
  /** Lively mode: the moves to pick from (default: the hero's own moves). */
  moves?: string[];
  /** A story movie: camera shots played in order; null stops it. */
  story?: { shots: StoryShot[]; key: number } | null;
  /** Story progress: a shot started, or the movie ended. */
  onStory?: (event: { event: 'shot'; index: number } | { event: 'end' }) => void;
}

export interface StoryShot {
  /** Camera: face, feet, side, low, back, wide, orbit, hero. */
  cam: string;
  /** Seconds. */
  dur: number;
  clip?: string;
  reps?: number;
  /** Animation speed (0.5 = slow motion). */
  slow?: number;
  /** The hero's sparks at the start of the shot. */
  burst?: boolean;
}

/** Renders a VRM/GLB body model in a transparent WebView. Swapping `model` reuses the same WebView. */
export const AvatarViewer3D: React.FC<AvatarViewer3DProps> = ({
  model,
  items = [],
  style,
  autoRotate = true,
  interactive = true,
  initialYaw = 0,
  lively = false,
  platform = false,
  onAction,
  effectColor,
  move,
  world,
  view = 'stage',
  story,
  onStory,
  moves,
}) => {
  const ready = useRef(false);
  const colors = useColors();
  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState<number>(0);
  const [errorText, setErrorText] = useState<string>('');

  // Built once; later model changes go through window.loadModel so the WebGL context is kept.
  const initialModel = useRef(model);
  const html = useMemo(
    () =>
      getAvatarViewerHtml({
        modelUrl: resolveModelUrl(initialModel.current.model_url),
        format: initialModel.current.model_format,
        autoRotate,
        interactive,
        initialYaw,
        lively,
        platform,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const loadedKey = useRef(`${model.model_url}|${model.model_format}`);
  useEffect(() => {
    const key = `${model.model_url}|${model.model_format}`;
    if (key === loadedKey.current) return;
    loadedKey.current = key;
    setStatus('loading');
    setProgress(0);
    const url = JSON.stringify(resolveModelUrl(model.model_url));
    const format = JSON.stringify(model.model_format);
    webViewRef.current?.injectJavaScript(`window.loadModel && window.loadModel(${url}, ${format}); true;`);
  }, [model.model_url, model.model_format]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.setAutoRotate && window.setAutoRotate(${autoRotate}); true;`);
  }, [autoRotate]);

  // Sent on every change and again after each model load (the page may not have been ready).
  const loadoutJson = useMemo(
    () =>
      JSON.stringify(
        items.map((it) => {
          const config = viewerConfig(it, model);
          return {
            category: it.category,
            config: config.model_url ? { ...config, model_url: resolveModelUrl(config.model_url) } : config,
          };
        }),
      ),
    [items, model],
  );
  const sendLoadout = () =>
    webViewRef.current?.injectJavaScript(`window.applyLoadout && window.applyLoadout(${loadoutJson}); true;`);
  useEffect(() => {
    sendLoadout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutJson]);

  const sendEffect = () =>
    webViewRef.current?.injectJavaScript(`window.setEffect && window.setEffect(${JSON.stringify(effectColor ?? null)}); true;`);
  useEffect(() => {
    sendEffect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectColor]);

  useEffect(() => {
    if (move) webViewRef.current?.injectJavaScript(`window.heroMove && window.heroMove(${JSON.stringify(move.clip)}); true;`);
  }, [move]);

  const inject = (js: string) => webViewRef.current?.injectJavaScript(`${js}; true;`);
  const sendWorld = () => inject(`window.setWorld && window.setWorld(${JSON.stringify(world ?? null)})`);
  const sendView = () => inject(`window.setView && window.setView(${JSON.stringify(view)})`);
  const movesJson = JSON.stringify(moves ?? null);
  const sendScene = () => {
    sendWorld();
    sendView();
    inject(`window.setMoves && window.setMoves(${movesJson})`);
  };
  useEffect(() => {
    if (ready.current) inject(`window.setMoves && window.setMoves(${movesJson})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movesJson]);
  useEffect(() => {
    if (ready.current) sendWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world]);
  useEffect(() => {
    if (ready.current) sendView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const sendStory = () => {
    if (story) inject(`window.playStory && window.playStory(${JSON.stringify(story.shots)})`);
    else inject('window.stopStory && window.stopStory()');
  };
  useEffect(() => {
    if (ready.current) sendStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PROGRESS') setProgress(msg.progress);
      else if (msg.type === 'LOADED') {
        setStatus('ready');
        sendLoadout();
        sendEffect();
        // the scene and story wait for the first model; later models keep them
        if (!ready.current) {
          ready.current = true;
          sendScene();
          sendStory();
        }
      }
      else if (msg.type === 'ACTION') onAction?.(msg.name, !!msg.tapped);
      else if (msg.type === 'STORY') onStory?.(msg.event === 'end' ? { event: 'end' } : { event: 'shot', index: msg.index });
      else if (msg.type === 'ERROR') {
        setErrorText(msg.message || 'Could not load model');
        setStatus('error');
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  return (
    <View style={[styles.container, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webViewRef}
        source={{ html, baseUrl: LOCAL_ASSET_ORIGIN }}
        style={styles.webView}
        containerStyle={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        onMessage={handleMessage}
        onError={() => {
          setErrorText('3D viewer unavailable');
          setStatus('error');
        }}
      />
      {status !== 'ready' && (
        <View style={styles.overlay} pointerEvents="none">
          {status === 'loading' ? (
            <>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.overlayText, { color: colors.textMuted }]}>
                {progress > 0 && progress < 1 ? `Loading ${Math.round(progress * 100)}%` : 'Loading model'}
              </Text>
            </>
          ) : (
            <>
              <AlertTriangle size={20} color={colors.danger} />
              <Text style={[styles.overlayText, { color: colors.textMuted }]}>{errorText}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
});
