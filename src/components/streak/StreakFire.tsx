// Layered SVG fire for the daily streak. Each layer flickers on its own timing; `ignite()` plays the
// spark -> catch -> rise sequence. Everything runs on the native driver.
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop, Circle } from 'react-native-svg';

const OUTER =
  'M50 2 C54 22 70 32 78 50 C86 68 84 94 70 110 C62 119 56 122 50 122 C36 122 20 110 17 88 C14 68 24 54 32 44 C32 56 36 64 42 68 C38 46 42 22 50 2 Z';
const MIDDLE =
  'M53 30 C57 46 69 56 70 74 C72 92 64 108 50 110 C38 110 30 100 30 86 C30 74 36 66 42 60 C42 70 46 76 50 78 C48 62 48 46 53 30 Z';
const CORE = 'M50 62 C54 74 62 82 61 94 C60 104 55 110 50 110 C44 110 39 104 39 96 C39 86 46 78 50 62 Z';

const PALETTES = {
  lit: { outer: ['#FFB13B', '#FF5A1F', '#D7261B'], middle: ['#FFE07A', '#FF9F1C'], core: ['#FFFFFF', '#FFE9A8'] },
  dim: { outer: ['#E8A04A', '#B8501E', '#7A2412'], middle: ['#F2C86A', '#C9771E'], core: ['#FFF3D6', '#F2CF86'] },
};

type Palette = typeof PALETTES.lit;

const FlameLayer: React.FC<{ d: string; stops: string[]; id: string }> = ({ d, stops, id }) => (
  <Svg width="100%" height="100%" viewBox="0 0 100 124">
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        {stops.map((c, i) => (
          <Stop key={i} offset={`${i / (stops.length - 1)}`} stopColor={c} />
        ))}
      </LinearGradient>
    </Defs>
    <Path d={d} fill={`url(#${id})`} />
  </Svg>
);

/** Small static flame for the week row. */
export const MiniFlame: React.FC<{ size?: number; dim?: boolean }> = ({ size = 18, dim }) => {
  const p = dim ? PALETTES.dim : PALETTES.lit;
  return (
    <View style={{ width: size, height: size * 1.24 }}>
      <View style={StyleSheet.absoluteFill}><FlameLayer d={OUTER} stops={p.outer} id={`mo${dim ? 'd' : 'l'}`} /></View>
      <View style={StyleSheet.absoluteFill}><FlameLayer d={MIDDLE} stops={p.middle} id={`mm${dim ? 'd' : 'l'}`} /></View>
      <View style={StyleSheet.absoluteFill}><FlameLayer d={CORE} stops={p.core} id={`mc${dim ? 'd' : 'l'}`} /></View>
    </View>
  );
};

/** A smouldering coal: what the flame looks like before the first workout. */
export const Coal: React.FC<{ size: number }> = ({ size }) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ width: size, height: size * 0.5, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Animated.View style={{ opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }) }}>
        <Svg width={size * 0.7} height={size * 0.3} viewBox="0 0 70 30">
          <Defs>
            <RadialGradient id="coal" cx="50%" cy="60%" r="60%">
              <Stop offset="0" stopColor="#FF8A3D" />
              <Stop offset="0.6" stopColor="#B33A12" />
              <Stop offset="1" stopColor="#3A1408" />
            </RadialGradient>
          </Defs>
          <Path d="M4 26 C6 14 18 8 30 10 C38 4 54 6 60 14 C68 16 70 24 66 28 Z" fill="url(#coal)" />
        </Svg>
      </Animated.View>
    </View>
  );
};

/** Two crossed logs with a bed of embers glowing under them; the fire sits on these. */
export const CampfireLogs: React.FC<{ width: number; heat: number }> = ({ width, heat }) => (
  <Svg width={width} height={width * 0.36} viewBox="0 0 120 43">
    <Defs>
      <LinearGradient id="bark" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#7A4A2A" />
        <Stop offset="1" stopColor="#3B2214" />
      </LinearGradient>
      <RadialGradient id="bed" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FF7A1A" stopOpacity={0.85 * heat} />
        <Stop offset="0.6" stopColor="#D7261B" stopOpacity={0.35 * heat} />
        <Stop offset="1" stopColor="#D7261B" stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Path d="M6 38 C30 30 90 30 114 38 C90 44 30 44 6 38 Z" fill="url(#bed)" />
    <Path d="M14 34 L104 14" stroke="url(#bark)" strokeWidth={11} strokeLinecap="round" />
    <Path d="M16 14 L106 34" stroke="url(#bark)" strokeWidth={11} strokeLinecap="round" />
    {/* end grain */}
    <Circle cx={104} cy={14} r={4.6} fill="#C08A5C" />
    <Circle cx={104} cy={14} r={2} fill="#8A5A36" />
    <Circle cx={16} cy={14} r={4.6} fill="#C08A5C" />
    <Circle cx={16} cy={14} r={2} fill="#8A5A36" />
    {/* glowing cracks where the logs cross */}
    <Path d="M52 24 L60 22 L68 24" stroke="#FF9F1C" strokeWidth={1.6} strokeLinecap="round" opacity={heat} fill="none" />
  </Svg>
);

const EMBER_COUNT = 12;

interface StreakFireProps {
  size: number;
  /** Today's workout is done: full, bright fire. Otherwise a smaller, dimmer flame. */
  strong: boolean;
  /** Width of the campfire logs under the flame; 0 hides them. */
  logsWidth?: number;
}

export interface StreakFireHandle {
  ignite: () => void;
}

export const StreakFire = forwardRef<StreakFireHandle, StreakFireProps>(({ size, strong, logsWidth = 0 }, ref) => {
  const palette: Palette = strong ? PALETTES.lit : PALETTES.dim;
  const height = size * 1.24;

  const spark = useRef(new Animated.Value(0)).current;
  const rise = useRef([0, 1, 2].map(() => new Animated.Value(0))).current; // outer, middle, core
  const flicker = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const glow = useRef(new Animated.Value(0)).current;
  const embers = useRef(Array.from({ length: EMBER_COUNT }, () => new Animated.Value(0))).current;

  // Fixed per mount so embers do not jump around between renders
  const emberSeeds = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => ({
        x: (i / EMBER_COUNT - 0.5) * size * 0.5 + (Math.random() - 0.5) * size * 0.12,
        drift: (Math.random() - 0.5) * size * 0.35,
        travel: height * (0.75 + Math.random() * 0.5),
        dot: 3 + Math.random() * 4,
        duration: 1400 + Math.random() * 1200,
        delay: Math.random() * 1600,
        color: Math.random() > 0.4 ? '#FFB13B' : '#FF6A1F',
      })),
    [size, height],
  );

  const loops = useRef<Animated.CompositeAnimation[]>([]);

  // Flicker and embers only. The glow loop starts after ignition finishes: starting it earlier would
  // interrupt the ignition's glow tween, and Animated.parallel stops every sibling when one stops.
  const startLoops = () => {
    loops.current.forEach((l) => l.stop());
    const periods = [620, 470, 380];
    loops.current = [
      ...flicker.map((f, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(f, { toValue: 1, duration: periods[i], easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(f, { toValue: 0, duration: periods[i] * 1.15, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        ),
      ),
      ...embers.map((e, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(emberSeeds[i].delay),
            Animated.timing(e, { toValue: 1, duration: emberSeeds[i].duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(e, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ),
      ),
    ];
    loops.current.forEach((l) => l.start());
  };

  useImperativeHandle(ref, () => ({
    ignite: () => {
      spark.setValue(0);
      rise.forEach((r) => r.setValue(0));
      glow.setValue(0);
      Animated.sequence([
        // 1. a spark catches at the base
        Animated.timing(spark, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(3)), useNativeDriver: true }),
        // 2. the flame rises out of it, inner layers a beat later
        Animated.parallel([
          Animated.timing(spark, { toValue: 2, duration: 300, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.stagger(
            110,
            rise.map((r) => Animated.spring(r, { toValue: 1, friction: 4.2, tension: 55, useNativeDriver: true })),
          ),
        ]),
      ]).start(() => {
        const glowLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(glow, { toValue: 0.6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
            Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          ]),
        );
        loops.current.push(glowLoop);
        glowLoop.start();
      });
      setTimeout(startLoops, 380);
    },
  }));

  useEffect(() => () => loops.current.forEach((l) => l.stop()), []);

  const layer = (i: number, d: string, stops: string[], id: string, sway: number) => {
    const f = flicker[i];
    return (
      <Animated.View
        key={id}
        style={[
          StyleSheet.absoluteFill,
          {
            transformOrigin: 'bottom',
            opacity: rise[i].interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
            transform: [
              { scaleY: Animated.multiply(rise[i], f.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] })) },
              { scaleX: Animated.multiply(rise[i].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }), f.interpolate({ inputRange: [0, 1], outputRange: [1.03, 0.96] })) },
              { skewX: f.interpolate({ inputRange: [0, 1], outputRange: [`${-sway}deg`, `${sway}deg`] }) },
            ],
          },
        ]}
      >
        <FlameLayer d={d} stops={stops} id={id} />
      </Animated.View>
    );
  };

  return (
    <View style={{ width: size * 1.8, height: height * 1.5, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* heat glow */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.8,
            height: size * 1.8,
            bottom: -size * 0.35 + (logsWidth ? logsWidth * 0.12 : 0),
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, strong ? 0.95 : 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.05] }) }],
          },
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="heat" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FF7A1A" stopOpacity={0.55} />
              <Stop offset="0.5" stopColor="#E2401A" stopOpacity={0.18} />
              <Stop offset="1" stopColor="#E2401A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="50%" r="50%" fill="url(#heat)" />
        </Svg>
      </Animated.View>

      {/* embers */}
      {embers.map((e, i) => {
        const s = emberSeeds[i];
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              bottom: height * 0.12 + (logsWidth ? logsWidth * 0.18 : 0),
              zIndex: 2,
              width: s.dot,
              height: s.dot,
              borderRadius: s.dot / 2,
              backgroundColor: s.color,
              opacity: e.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.7, 0] }),
              transform: [
                { translateX: e.interpolate({ inputRange: [0, 1], outputRange: [s.x, s.x + s.drift] }) },
                { translateY: e.interpolate({ inputRange: [0, 1], outputRange: [0, -s.travel] }) },
                { scale: e.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
              ],
            }}
          />
        );
      })}

      {/* flame, sitting down into the logs */}
      <View style={{ width: size, height, marginBottom: logsWidth ? -logsWidth * 0.17 : 0, zIndex: 1 }}>
        {layer(0, OUTER, palette.outer, 'fo', 3)}
        {layer(1, MIDDLE, palette.middle, 'fm', 4.5)}
        {layer(2, CORE, palette.core, 'fc', 6)}
      </View>

      {logsWidth > 0 && <CampfireLogs width={logsWidth} heat={strong ? 1 : 0.6} />}

      {/* spark */}
      <Animated.View
        style={[
          styles.spark,
          {
            bottom: height * 0.08 + (logsWidth ? logsWidth * 0.18 : 0),
            zIndex: 2,
            opacity: spark.interpolate({ inputRange: [0, 0.3, 1, 2], outputRange: [0, 1, 1, 0] }),
            transform: [{ scale: spark.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1.4, 2.6] }) }],
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  glow: { position: 'absolute', alignSelf: 'center' },
  spark: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFF4D6',
  },
});
