import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { AlertTriangle } from 'lucide-react-native';
import { getAvatarViewerHtml } from '../avatarViewerHtml';
import { AvatarModel, LOCAL_ASSET_ORIGIN, resolveModelUrl } from '../../../utils/avatarShopService';
import { useColors } from '../../../theme';

interface AvatarViewer3DProps {
  model: AvatarModel;
  /** Outfit / hair / accessory items worn on the model. */
  items?: AvatarModel[];
  style?: StyleProp<ViewStyle>;
  autoRotate?: boolean;
  /** Drag to spin the model. */
  interactive?: boolean;
}

/** Renders a VRM/GLB body model in a transparent WebView. Swapping `model` reuses the same WebView. */
export const AvatarViewer3D: React.FC<AvatarViewer3DProps> = ({
  model,
  items = [],
  style,
  autoRotate = true,
  interactive = true,
}) => {
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
        items.map((it) => ({
          category: it.category,
          config: it.config.model_url ? { ...it.config, model_url: resolveModelUrl(it.config.model_url) } : it.config,
        })),
      ),
    [items],
  );
  const sendLoadout = () =>
    webViewRef.current?.injectJavaScript(`window.applyLoadout && window.applyLoadout(${loadoutJson}); true;`);
  useEffect(() => {
    sendLoadout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadoutJson]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'PROGRESS') setProgress(msg.progress);
      else if (msg.type === 'LOADED') {
        setStatus('ready');
        sendLoadout();
      }
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
