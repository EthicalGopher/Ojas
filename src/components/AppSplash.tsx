import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StatusBar, StyleSheet, View } from 'react-native';
import LogoMark from '../../assets/logo-mark.svg';

// Same colour and logo size as the native launch splash (res/drawable*/splashscreen_logo.png,
// 200 dp), so the hand-off from the native window is invisible.
const BG = '#222327';
const GOLD = '#C9A163';
const LOGO_SIZE = 200;
const MIN_VISIBLE_MS = 1400;

// The splash unmounts and remounts when auth finishes loading (AppShell renders it in both
// branches), so its timeline is anchored to app start rather than to the mount.
const APP_START = Date.now();
const INTRO_MS = 900;

interface AppSplashProps {
  /** The app underneath is ready: fade out once the minimum time has passed. */
  ready?: boolean;
  onDone?: () => void;
}

/** Brand splash shown while the app starts. */
export const AppSplash: React.FC<AppSplashProps> = ({ ready = false, onDone }) => {
  const introAt = Math.min(1, (Date.now() - APP_START) / INTRO_MS);
  const intro = useRef(new Animated.Value(introAt)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: (1 - introAt) * INTRO_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - APP_START));
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        () => onDoneRef.current?.(),
      );
    }, wait);
    return () => clearTimeout(t);
  }, [ready, fade]);

  return (
    <Animated.View style={[styles.container, { opacity: fade }]} pointerEvents={ready ? 'none' : 'auto'}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.16] }),
              transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) }],
            },
          ]}
        />
        <LogoMark width={LOGO_SIZE} height={LOGO_SIZE} />
      </View>
      <Animated.Text
        style={[
          styles.wordmark,
          {
            opacity: intro,
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}
      >
        OJAS
      </Animated.Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100000,
    elevation: 100,
  },
  center: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    // centred on the ring of the mark (it sits a little left of and below the canvas centre)
    left: LOGO_SIZE * 0.24,
    top: LOGO_SIZE * 0.27,
    width: LOGO_SIZE * 0.48,
    height: LOGO_SIZE * 0.48,
    borderRadius: LOGO_SIZE * 0.24,
    backgroundColor: GOLD,
  },
  wordmark: {
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_SIZE / 2 + 8,
    color: GOLD,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 10,
    paddingLeft: 10, // balances the trailing letter spacing
  },
});
