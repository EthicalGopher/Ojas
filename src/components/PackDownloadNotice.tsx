import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { PACK_DEV_FAULT } from '../utils/assetPacks';
import {
  PACK_SIZES,
  PackName,
  PackState,
  failureMessage,
  formatProgress,
  gate,
} from '../utils/assetPacksLogic';

interface Props {
  pack: PackName;
  state: PackState;
  /** What is being downloaded, in a few words: "Tree Pose form checker". */
  title: string;
  /** No change for 60 s while a download should be moving. */
  stalled: boolean;
  onRetry: () => void;
  onConfirm: () => void;
  onCheckAgain: () => void;
  onClose?: () => void;
}

/** Full-screen notice shown instead of a feature whose Play asset pack is not ready yet. */
export function PackDownloadNotice({ pack, state, title, stalled, onRetry, onConfirm, onCheckAgain, onClose }: Props) {
  const g = gate(state);
  const progress = formatProgress(state, PACK_SIZES[pack]);
  const barWidth = `${Math.round(Math.max(0, Math.min(1, state.progress || 0)) * 100)}%` as const;

  let body: React.ReactNode;
  if (g === 'retry') {
    body = (
      <>
        <Text style={styles.message}>{failureMessage(state.reason)}</Text>
        <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </>
    );
  } else if (g === 'unavailable') {
    body = <Text style={styles.message}>Install Ojas from Google Play to get this feature</Text>;
  } else if (state.status === 'needs_confirmation') {
    body = (
      <>
        <Text style={styles.message}>Google Play needs your OK to download {title}.</Text>
        <Pressable style={styles.button} onPress={onConfirm} accessibilityRole="button">
          <Text style={styles.buttonText}>Allow download</Text>
        </Pressable>
      </>
    );
  } else if (state.status === 'waiting_wifi') {
    body = <Text style={styles.message}>Waiting for Wi-Fi to download {title}</Text>;
  } else {
    body = (
      <>
        <ActivityIndicator color="#E25822" />
        <Text style={styles.message}>Downloading {title} ({progress})</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: barWidth }]} />
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      {PACK_DEV_FAULT ? <Text style={styles.devBanner}>DEV FAULT: {PACK_DEV_FAULT}</Text> : null}
      <View style={styles.card}>
        {body}
        {stalled ? (
          <>
            <Text style={styles.hint}>Still waiting? Connect to Wi-Fi or allow mobile data for Google Play.</Text>
            <Pressable style={styles.secondary} onPress={onCheckAgain} accessibilityRole="button">
              <Text style={styles.secondaryText}>Check again</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {onClose ? (
        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0D14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  devBanner: { position: 'absolute', top: 48, color: '#FBBF24', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 14, padding: 24, borderRadius: 20, backgroundColor: '#161B26' },
  message: { color: '#E2E8F0', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  hint: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  track: { width: '100%', height: 6, borderRadius: 3, backgroundColor: '#243044', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#E25822' },
  button: { paddingHorizontal: 24, height: 44, borderRadius: 22, backgroundColor: '#E25822', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondary: { paddingHorizontal: 18, height: 38, borderRadius: 19, borderWidth: 1, borderColor: '#475569', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#E2E8F0', fontSize: 13, fontWeight: '700' },
  close: { position: 'absolute', bottom: 48, paddingHorizontal: 20, height: 40, justifyContent: 'center' },
  closeText: { color: '#94A3B8', fontSize: 14, fontWeight: '700' },
});
