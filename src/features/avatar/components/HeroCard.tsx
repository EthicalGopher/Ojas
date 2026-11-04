// The hero card: one design for every hero (Shop gallery, Avatar screen). The same deep-blue card,
// halo and floor glow for all; only the hero and their pose change (config.card, rendered by
// scripts/blender/render_hero_card.py). A name banner, and corner badges for the hero you play.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Lock } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { GradientFill } from '../../../components/game/Gradient';
import { AvatarModel, resolveModelUrl } from '../../../utils/avatarShopService';
import { useColors } from '../../../theme';
import { CoinDot, RARITY_COLORS } from './AvatarShopScreen';
import type { HeroStatus } from './HeroScreen';

export const CARD_ASPECT = 1.5; // height / width, as the card art (720 x 1080)

const CARD = { top: '#3B4E9E', bottom: '#0C1236', edge: 'rgba(170,200,255,0.5)' };

export const HeroCard: React.FC<{
  hero: AvatarModel;
  width: number;
  /** Shop: what the banner says (playing, owned, price, level). Without it the banner shows the role. */
  status?: HeroStatus;
  /** Avatar screen: the hero being picked. */
  selected?: boolean;
  onPress: () => void;
}> = ({ hero, width, status, selected, onPress }) => {
  const colors = useColors();
  const art = hero.config.card ?? hero.thumbnail_url;
  const locked = status === 'level';
  const playing = status === 'playing';
  const lit = selected ?? playing;
  const height = width * CARD_ASPECT;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${hero.name}${status ? `, ${status === 'buy' ? `${hero.price_coins} coins` : status === 'level' ? `unlocks at level ${hero.unlock_level}` : status}` : ''}`}
      style={({ pressed }) => [
        styles.card,
        { width, height, borderColor: lit ? colors.accentFrom : CARD.edge, borderWidth: lit ? 3 : 2 },
        lit && { boxShadow: `0 0 16px ${colors.accentFrom}AA` },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <GradientFill from={CARD.top} to={CARD.bottom} direction="vertical" radius={10} />
      {/* halo behind the hero, and a warm glow on the floor under their feet */}
      <View style={[styles.halo, { width: width * 1.2, height: width * 1.2, borderRadius: width * 0.6, left: -width * 0.1, top: height * 0.08 }]} />
      <View style={[styles.floor, { width: width * 0.9, height: width * 0.22, borderRadius: width * 0.45, left: width * 0.05, top: height * 0.8 }]} />
      {art ? (
        <Image source={{ uri: resolveModelUrl(art) }} style={[StyleSheet.absoluteFill, locked && { opacity: 0.4 }]} resizeMode="cover" />
      ) : (
        <Text style={styles.initial}>{hero.name.charAt(0)}</Text>
      )}
      {locked && (
        <View style={styles.center} pointerEvents="none">
          <Lock size={26} color="#FFFFFF" strokeWidth={3} />
        </View>
      )}
      {(playing || status === 'unlocked') && (
        <View style={[styles.ribbon, { backgroundColor: playing ? colors.success : colors.accentFrom }]}>
          <GText variant="label" size={9} style={{ color: '#FFFFFF', letterSpacing: 1 }}>{playing ? 'PLAYING' : 'FREE'}</GText>
        </View>
      )}
      {selected && (
        <View style={[styles.tick, { backgroundColor: colors.accentFrom }]}>
          <Check size={13} color="#FFFFFF" strokeWidth={3.5} />
        </View>
      )}
      {hero.rarity !== 'common' && (
        <View style={[styles.rarity, { backgroundColor: RARITY_COLORS[hero.rarity] }]}>
          <GText variant="label" size={9} style={{ color: '#FFFFFF' }}>{hero.rarity.toUpperCase()}</GText>
        </View>
      )}
      <View style={styles.banner}>
        <GText variant="display" size={width > 150 ? 18 : 15} numberOfLines={1} style={{ color: '#FFFFFF' }}>{hero.name}</GText>
        {status === 'buy' ? (
          <View style={styles.price}>
            <CoinDot size={11} />
            <GText variant="label" size={11} style={{ color: '#FFD45C' }}>{hero.price_coins.toLocaleString()}</GText>
          </View>
        ) : (
          <GText variant="label" size={10} numberOfLines={1} style={{ color: status === 'unlocked' ? '#FFD45C' : 'rgba(210,225,255,0.8)', letterSpacing: 1 }}>
            {status
              ? playing
                ? 'PLAYING'
                : status === 'owned'
                  ? 'OWNED'
                  : status === 'unlocked'
                    ? 'CLAIM'
                    : `LV ${hero.unlock_level}`
              : (hero.config.hero?.role ?? '').toUpperCase()}
          </GText>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 10, overflow: 'hidden', backgroundColor: CARD.bottom },
  halo: { position: 'absolute', backgroundColor: 'rgba(160,190,255,0.16)' },
  floor: { position: 'absolute', backgroundColor: 'rgba(255,140,70,0.28)' },
  initial: { flex: 1, textAlign: 'center', textAlignVertical: 'center', fontSize: 56, fontWeight: '900', color: '#FFFFFF' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', top: 14, left: -30, width: 110, paddingVertical: 3, alignItems: 'center', transform: [{ rotate: '-45deg' }] },
  tick: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  rarity: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 5,
    alignItems: 'center',
    backgroundColor: 'rgba(11,16,48,0.82)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(170,200,255,0.35)',
  },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
