import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  LayoutChangeEvent,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LOADING_ANIMATION = require('../../assets/Videoes/loading_animation.gif');

const COLORS = {
  background: '#1A1C20',
  track: '#262A32',
  textPrimary: '#F2F3F5',
  textSecondary: '#8B909C',
  textTertiary: '#585D68',
  accent: '#E25822',
  coral: '#FF6B6B',
};

export interface FFALoadingScreenProps {
  initialSeconds?: number;
  serverSeconds?: number;
  playerCount?: number;
  maxPlayers?: number;
  title?: string;
  message?: string;
  onCancel?: () => void;
  onTimerExpired?: () => void;
  fullScreen?: boolean;
}

export const FFALoadingScreen: React.FC<FFALoadingScreenProps> = ({
  initialSeconds = 30,
  serverSeconds,
  playerCount = 1,
  maxPlayers = 10,
  title = 'BATTLE GROUND LOBBY',
  message = 'Gathering athletes for 10-player battle',
  onCancel,
  onTimerExpired,
  fullScreen = true,
}) => {
  const [countdown, setCountdown] = useState<number>(
    typeof serverSeconds === 'number' ? serverSeconds : initialSeconds
  );
  const [trackWidth, setTrackWidth] = useState(0);

  const contentFade = useRef(new Animated.Value(0)).current;
  const timerScale = useRef(new Animated.Value(1)).current;
  const dotPulse = useRef(new Animated.Value(0.4)).current;
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const timerExpiredCalled = useRef(false);

  // Sync countdown whenever server pushes an authoritative update
  useEffect(() => {
    if (typeof serverSeconds === 'number') {
      setCountdown(serverSeconds);
    }
  }, [serverSeconds]);

  // Robust on-device 1-second interval ticker
  useEffect(() => {
    timerExpiredCalled.current = false;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!timerExpiredCalled.current) {
            timerExpiredCalled.current = true;
            onTimerExpired?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimerExpired]);

  // Spring bump on tick
  useEffect(() => {
    timerScale.setValue(1.15);
    Animated.spring(timerScale, {
      toValue: 1,
      friction: 4,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [countdown, timerScale]);

  // Entrance fade
  useEffect(() => {
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentFade]);

  // Gentle breathing dot pulse
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 0.35,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse]);

  // Indeterminate progress sweep
  useEffect(() => {
    if (trackWidth === 0) return;
    indicatorPosition.setValue(0);
    const loop = Animated.loop(
      Animated.timing(indicatorPosition, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [trackWidth, indicatorPosition]);

  const indicatorWidth = trackWidth * 0.32;
  const translateX = indicatorPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [-indicatorWidth, trackWidth],
  });

  const isUrgent = countdown <= 5 && countdown > 0;
  const timerTextColor = isUrgent ? COLORS.coral : COLORS.accent;

  return (
    <View style={[styles.container, !fullScreen && styles.overlayContainer]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Top clean title without boxes or icons */}
      <Text style={styles.title}>{title}</Text>

      {/* Clean, Large Typography Countdown Timer (No border boxes or emoji) */}
      <Animated.View style={[styles.timerSection, { transform: [{ scale: timerScale }] }]}>
        <Text style={[styles.timerNumber, { color: timerTextColor }]}>
          {countdown < 10 ? `0${countdown}` : countdown}
        </Text>
        <Text style={styles.timerSubLabel}>
          {countdown === 0 ? 'STARTING MATCH' : isUrgent ? 'GET READY' : 'SECONDS REMAINING'}
        </Text>
      </Animated.View>

      {/* Hero Animated Illustration */}
      <Animated.View style={[styles.animationWrap, { opacity: contentFade }]}>
        <Image source={LOADING_ANIMATION} style={styles.animationImage} resizeMode="contain" />
      </Animated.View>

      {/* Bottom Info Section - Clean minimal text */}
      <Animated.View style={[styles.bottomContent, { opacity: contentFade }]}>
        {/* Clean text line for joined athletes */}
        <Text style={styles.rosterText}>
          {playerCount} of {maxPlayers} athletes connected
        </Text>

        {/* Status Line with breathing dot */}
        <View style={styles.statusRow}>
          <Animated.View style={[styles.statusDot, { opacity: dotPulse }]} />
          <Text style={styles.statusText} numberOfLines={2}>
            {countdown === 0
              ? 'Launching match...'
              : `Match starts in ${countdown}s or when full`}
          </Text>
        </View>

        {/* Clean progress line */}
        <View
          style={styles.track}
          onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {trackWidth > 0 && (
            <Animated.View
              style={[
                styles.indicator,
                { width: indicatorWidth, transform: [{ translateX }] },
              ]}
            />
          )}
        </View>

        {/* Cancel Action */}
        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={styles.cancelButton}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 58,
    paddingBottom: 36,
    paddingHorizontal: 28,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 25,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  timerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  timerNumber: {
    fontSize: 64,
    fontWeight: '900',
    lineHeight: 68,
    letterSpacing: 2,
    textAlign: 'center',
  },
  timerSubLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  animationWrap: {
    width: SCREEN_WIDTH * 0.54,
    height: SCREEN_WIDTH * 0.54,
    maxWidth: 240,
    maxHeight: 240,
    justifyContent: 'center',
    alignItems: 'center',
  },
  animationImage: {
    width: '100%',
    height: '100%',
  },
  bottomContent: {
    width: '100%',
    alignItems: 'center',
  },
  rosterText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
    marginRight: 8,
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  track: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.track,
    overflow: 'hidden',
    marginBottom: 20,
  },
  indicator: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});

export default FFALoadingScreen;
