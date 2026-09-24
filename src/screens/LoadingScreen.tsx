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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const QUOTES_API_URL = 'https://motivational-spark-api.vercel.app/api/quotes/random';

// Local animated asset (instant native Image rendering, no WebView sandbox required)
const LOADING_ANIMATION = require('../../assets/Videoes/loading_animation.gif');

const COLORS = {
  background: '#1A1C20',
  track: '#262A32',
  textPrimary: '#F2F3F5',
  textSecondary: '#8B909C',
  textTertiary: '#585D68',
  accent: '#E25822',
};

interface QuoteData {
  quote: string;
  author: string;
}

export interface LoadingScreenProps {
  message?: string;
  title?: string;
  badgeText?: string;
  subInfo?: string;
  onCancel?: () => void;
  fullScreen?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Searching for a worthy rival in the queue',
  title = 'Finding opponent',
  badgeText,
  subInfo,
  onCancel,
  fullScreen = true,
}) => {
  const insets = useSafeAreaInsets();
  const [quoteData, setQuoteData] = useState<QuoteData>({
    quote: 'The secret of getting ahead is getting started.',
    author: 'Mark Twain',
  });
  const [trackWidth, setTrackWidth] = useState(0);

  const contentFade = useRef(new Animated.Value(0)).current;
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(0.4)).current;

  // Fetch a random quote; keep the local fallback on any failure.
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const response = await fetch(QUOTES_API_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (isMounted && data?.quote) {
          setQuoteData({ quote: data.quote, author: data.author || 'Unknown' });
        }
      } catch (err) {
        console.log('[LoadingScreen] Quote fetch fallback:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // One orchestrated entrance fade for all content — a single moment,
  // not a fade on every element.
  useEffect(() => {
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentFade]);

  // Gentle breathing dot beside the status line — the one place motion
  // and the accent color do their work.
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
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse]);

  // Indeterminate progress indicator: a short segment slides across the
  // track. Both ends of the loop sit off-track, so the reset is invisible
  // (unlike a bar that grows to 100% and visibly snaps back to 0%).
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

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.container, !fullScreen && styles.overlayContainer, { paddingBottom: insets.bottom + 64 }]}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      <Text style={styles.title}>{title}</Text>

      {badgeText && (
        <View style={styles.badgePill}>
          <Text style={styles.badgePillText}>{badgeText}</Text>
        </View>
      )}

      <Animated.View style={[styles.animationWrap, { opacity: contentFade }]}>
        <Image source={LOADING_ANIMATION} style={styles.animationImage} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={[styles.bottomContent, { opacity: contentFade }]}>
        {subInfo ? (
          <View style={styles.subInfoBox}>
            <Text style={styles.subInfoText}>{subInfo}</Text>
          </View>
        ) : (
          <View style={styles.quoteBlock}>
            <Text style={styles.quoteText}>&ldquo;{quoteData.quote}&rdquo;</Text>
            <Text style={styles.authorText}>{quoteData.author}</Text>
          </View>
        )}

        <View style={styles.statusRow}>
          <Animated.View style={[styles.statusDot, { opacity: dotPulse }]} />
          <Text style={styles.statusText}>{message}</Text>
        </View>

        <View style={styles.track} onLayout={handleTrackLayout}>
          {trackWidth > 0 && (
            <Animated.View
              style={[
                styles.indicator,
                { width: indicatorWidth, transform: [{ translateX }] },
              ]}
            />
          )}
        </View>

        {onCancel && (
          <TouchableOpacity
            onPress={onCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.cancelButton}
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
    paddingTop: 64,
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
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  animationWrap: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    maxWidth: 260,
    maxHeight: 260,
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
  quoteBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  quoteText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  authorText: {
    color: COLORS.textTertiary,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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
    paddingHorizontal: 16,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  badgePill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(232, 213, 196, 0.15)',
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  badgePillText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subInfoBox: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#161B22',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  subInfoText: {
    color: '#E8D5C4',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default LoadingScreen;