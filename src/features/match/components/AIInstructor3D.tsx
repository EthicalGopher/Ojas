import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { AlertTriangle } from 'lucide-react-native';
import { AiInstructorMode, getAiInstructorHtml } from '../aiInstructorHtml';
import { LOCAL_ASSET_ORIGIN } from '../../../utils/avatarShopService';

interface AIInstructor3DProps {
  /** squat: follows phaseProgress; idle / rest / cheer: loops. */
  mode: AiInstructorMode;
  /** Bot rep progress, 0 (standing) -> 0.5 (bottom) -> 1 (standing again). */
  phaseProgress: number;
}

/** The AI opponent as the 3D instructor: squats in step with the bot's reps, idles, rests, cheers. */
export const AIInstructor3D: React.FC<AIInstructor3DProps> = ({ mode, phaseProgress }) => {
  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState<number>(0);
  const html = useMemo(() => getAiInstructorHtml(), []);
  // Watchdog: the page sends a heartbeat every 2 s while it renders. If a phone's WebView stalls
  // (GPU busy with the pose tracker, lost WebGL context) the AI would freeze; reload it instead.
  const [reloadKey, setReloadKey] = useState<number>(0);
  const lastBeat = useRef<number>(Date.now());
  const reloads = useRef<number>(0);
  const reload = () => {
    if (reloads.current >= 3) {
      setStatus('error');
      return;
    }
    reloads.current += 1;
    lastBeat.current = Date.now();
    setStatus('loading');
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    if (status !== 'ready') return;
    const t = setInterval(() => {
      if (Date.now() - lastBeat.current > 6000) reload();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return;
    webViewRef.current?.injectJavaScript(
      `window.setAnim && window.setAnim(${JSON.stringify(mode)}, ${phaseProgress}); true;`,
    );
  }, [mode, phaseProgress, status]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'HEARTBEAT') lastBeat.current = Date.now();
      else if (msg.type === 'PROGRESS') setProgress(msg.progress);
      else if (msg.type === 'LOADED') {
        lastBeat.current = Date.now();
        setStatus('ready');
      } else if (msg.type === 'ERROR') {
        if (msg.message === 'webgl context lost') reload();
        else setStatus('error');
      }
    } catch {
      // ignore non-JSON messages
    }
  };

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ html, baseUrl: LOCAL_ASSET_ORIGIN }}
        style={styles.webView}
        containerStyle={styles.webView}
        javaScriptEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        scrollEnabled={false}
        overScrollMode="never"
        androidLayerType="hardware"
        onMessage={handleMessage}
        onError={() => setStatus('error')}
        onRenderProcessGone={() => reload()}
      />
      {status !== 'ready' && (
        <View style={styles.overlay}>
          {status === 'loading' ? (
            <>
              <ActivityIndicator color="#E25822" />
              <Text style={styles.overlayText}>
                {progress > 0 && progress < 1 ? `Loading AI ${Math.round(progress * 100)}%` : 'Loading AI'}
              </Text>
            </>
          ) : (
            <>
              <AlertTriangle size={20} color="#EF4444" />
              <Text style={styles.overlayText}>3D AI unavailable</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: '#0A0D14', overflow: 'hidden' },
  webView: { flex: 1, backgroundColor: 'transparent' },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
});
