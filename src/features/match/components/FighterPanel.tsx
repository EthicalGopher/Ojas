// One half of the VS screen (matchmaking and match intro): a player's character in their own world filling
// the half, with a name plate. Left is you (orange), right the opponent (blue, mirrored so both face the
// middle). Scenes are frames from the hero story videos (Arjun climbing, Meera sprinting): avatars/*_vs.jpg.
// While searching, the rival half is a dark silhouette (the stand render, avatars/*_stand.png) with a "?".
import React from 'react';
import { Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { GText } from '../../../components/game';
import { GradientFill } from '../../../components/game/Gradient';
import { Slant } from '../../../components/game/Slant';
import { useColors } from '../../../theme';

const STAND_ASPECT = 1080 / 720; // height / width of the stand renders

export const FighterPanel: React.FC<{
  side: 'left' | 'right';
  /** The hero's scene (fills the half); null shows `placeholder` on the side colour. */
  scene: string | null;
  label: string;
  name: string;
  meta?: React.ReactNode;
  placeholder?: React.ReactNode;
  /** The unknown rival while searching: this stand render as a dark silhouette, under `placeholder`. */
  silhouette?: string | null;
}> = ({ side, scene, label, name, meta, placeholder, silhouette }) => {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const left = side === 'left';
  const halfW = width / 2;
  const standH = height * 0.96;
  const standW = standH / STAND_ASPECT;
  const mirror = left ? undefined : [{ scaleX: -1 }];
  return (
    <View style={[styles.half, left ? { left: 0 } : { right: 0 }, { width: halfW }]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}>
        <GradientFill from={left ? '#05060C' : '#0B2A6E'} to={left ? '#7A2A0E' : '#05060C'} direction="horizontal" />
      </View>
      {scene ? <Image source={{ uri: scene }} resizeMode="cover" style={[StyleSheet.absoluteFill, { transform: mirror }]} /> : null}
      {silhouette ? (
        <Image
          source={{ uri: silhouette }}
          tintColor="#13234A"
          resizeMode="contain"
          style={{ position: 'absolute', bottom: 0, width: standW, height: standH, left: (halfW - standW) / 2, transform: mirror }}
        />
      ) : null}
      {(!scene || silhouette) && placeholder ? <View style={[StyleSheet.absoluteFill, styles.center]}>{placeholder}</View> : null}
      {/* the bottom fades dark under the plate and footer so the text stays readable */}
      {scene ? <BottomFade id={`fade-${side}`} height={height * 0.5} /> : null}
      {/* a seam between the halves */}
      <View style={[styles.seam, left ? { right: 0 } : { left: 0 }]} />
      <View style={[styles.plate, left ? { left: 24 } : { right: 24, alignItems: 'flex-end' }]}>
        {left ? <Slant fill={c.accentFrom} to={c.accentTo} /> : <Slant fill="#1F4FB8" to="#3B8DFF" />}
        <GText variant="label" size={12} style={{ color: '#FFFFFF' }}>{label}</GText>
        <GText variant="hero" size={28} style={{ color: '#FFFFFF' }} numberOfLines={1}>{name}</GText>
        {meta ? <View style={styles.meta}>{meta}</View> : null}
      </View>
    </View>
  );
};

/** Transparent at the top to near-black at the bottom (SVG stop opacity: GradientFill has no alpha). */
const BottomFade: React.FC<{ id: string; height: number }> = ({ id, height }) => (
  <Svg style={[styles.shade, { height }]} width="100%" height={height} preserveAspectRatio="none">
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#05060C" stopOpacity={0} />
        <Stop offset="1" stopColor="#05060C" stopOpacity={0.92} />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
  </Svg>
);

const styles = StyleSheet.create({
  half: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden', backgroundColor: '#05060C' },
  center: { alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,210,122,0.6)' },
  plate: { position: 'absolute', bottom: 120, paddingHorizontal: 30, paddingVertical: 8, minWidth: 220, maxWidth: '80%' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
});
