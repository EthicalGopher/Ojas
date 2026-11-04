import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GameTopBar, GText } from '../../../components/game';
import { GradientFill as GameGradient } from '../../../components/game/Gradient';
import { Slant } from '../../../components/game/Slant';
import { juice } from '../../../juice/juice';
import { HeroScreen, HeroStatus } from './HeroScreen';
import { HeroCard } from './HeroCard';
import {
  AvatarModel,
  AvatarRarity,
  BUNDLED_AVATARS,
  fetchAvatarCatalog,
  findAvatar,
  getEquippedAvatarId,
  isAvatarOwned,
  isUnlockedByLevel,
} from '../../../utils/avatarShopService';
import { computeCoinBalance, computeTotalXp, levelFromXp, XP_PER_COIN } from '../../../utils/gamification';
import { useUserStore } from '../../../store/userStore';
import { useColors } from '../../../theme';

export const RARITY_COLORS: Record<AvatarRarity, string> = {
  common: '#94A3B8',
  rare: '#38BDF8',
  epic: '#A78BFA',
  legendary: '#F59E0B',
};

/** The Shop sells characters. Some are bought with coins, some unlock by reaching a level, and the
 * starters are free. */
type ShopTab = 'all' | 'owned' | 'level' | 'coins';
const TABS: { key: ShopTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Owned' },
  { key: 'level', label: 'Level rewards' },
  { key: 'coins', label: 'For coins' },
];

// The hero hall is deep blue whatever the app theme, so the card art stands out.
const HALL = { top: '#24335F', bottom: '#0C1230', rail: 'rgba(8,12,34,0.5)', line: 'rgba(140,180,255,0.35)' };
const CARD_GAP = 14;

/** Small gold coin drawn with views, used next to prices. */
export const CoinDot: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: '#FBBF24',
      borderWidth: Math.max(1.5, size / 7),
      borderColor: '#D97706',
    }}
  />
);

type Status = HeroStatus;

interface AvatarShopScreenProps {
  onBack: () => void;
}

/** The Shop (game style): a hero gallery. A rail of categories on the left, tall portrait cards on the
 * right; tapping a card opens that hero on a 3D stage with its play / buy button. */
export const AvatarShopScreen: React.FC<AvatarShopScreenProps> = ({ onBack }) => {
  const colors = useColors();
  const profile = useUserStore((s) => s.profile);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const filter = useUserStore((s) => s.shopFilter);
  const setFilter = useUserStore((s) => s.setShopFilter);

  const [catalog, setCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  // openShop('owned') opens the Owned shelf
  const [tab, setTab] = useState<ShopTab>(filter === 'owned' ? 'owned' : 'all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [gridWidth, setGridWidth] = useState<number>(0);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const coins = computeCoinBalance(profile);
  const level = levelFromXp(computeTotalXp(profile)).level;
  const equippedId = getEquippedAvatarId(profile);

  const loadCatalog = useCallback(async () => {
    setCatalog(await fetchAvatarCatalog());
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCatalog(), refreshProfile()]);
    setRefreshing(false);
  };

  const characters = useMemo(() => catalog.filter((m) => m.category === 'character'), [catalog]);
  // Level rewards and For coins only appear when some character is earned that way.
  const tabs = TABS.filter(
    ({ key }) =>
      key === 'all' || key === 'owned' || characters.some((m) => (key === 'level' ? !!m.unlock_level : m.price_coins > 0)),
  );

  const pickTab = (key: ShopTab) => {
    juice.play('toggle');
    setTab(key);
    setFilter(key === 'owned' ? 'owned' : 'all');
  };

  /** What a card and the action button show for a character. */
  const statusOf = (m: AvatarModel): Status => {
    if (m.id === equippedId) return 'playing';
    if (isAvatarOwned(profile, m)) return 'owned';
    if (m.unlock_level) return isUnlockedByLevel(m, level) ? 'unlocked' : 'level';
    return 'buy';
  };

  const visibleItems = useMemo(
    () =>
      characters.filter((m) => {
        if (tab === 'owned') return isAvatarOwned(profile, m);
        if (tab === 'level') return !!m.unlock_level;
        if (tab === 'coins') return m.price_coins > 0;
        return true;
      }),
    [characters, tab, profile],
  );

  const detail = detailId ? findAvatar(catalog, detailId) : null;

  // as many columns as fit at ~125dp, at least four
  const columns = Math.max(4, Math.floor((gridWidth + CARD_GAP) / (125 + CARD_GAP)));
  // a whole card and the coin note fit on screen, however short the phone
  const cardWidth = gridWidth > 0 ? Math.min((gridWidth - CARD_GAP * (columns - 1)) / columns, (windowHeight - 170) / 1.5) : 0;

  return (
    <View style={[styles.container, { backgroundColor: HALL.bottom }]}>
      <GameGradient from={HALL.top} to={HALL.bottom} direction="vertical" />
      <View style={styles.glow} pointerEvents="none" />
      <GameTopBar title="Heroes" onBack={onBack} />

      <View style={styles.body}>
          {/* RAIL: categories */}
          <View style={[styles.rail, windowWidth < 700 && { width: 118 }, { backgroundColor: HALL.rail, borderRightColor: HALL.line }]}>
            {tabs.map(({ key, label }) => {
              const active = tab === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => pickTab(key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.railItem, pressed && { opacity: 0.7 }]}
                >
                  {active && <Slant fill={colors.accentFrom} to={colors.accentTo} slope={0.3} />}
                  <GText
                    variant="display"
                    size={active ? 18 : 16}
                    numberOfLines={1}
                    style={{ color: active ? colors.onGradient : 'rgba(225,235,255,0.78)', textAlign: active ? 'center' : 'right' }}
                  >
                    {label}
                  </GText>
                </Pressable>
              );
            })}
          </View>

          {/* GALLERY: portrait cards */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
          >
            <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {cardWidth > 0 &&
                visibleItems.map((item) => (
                  <HeroCard
                    key={item.id}
                    hero={item}
                    status={statusOf(item)}
                    width={cardWidth}
                    onPress={() => {
                      juice.play('tap');
                      setDetailId(item.id);
                    }}
                  />
                ))}
            </View>

            {visibleItems.length === 0 && (
              <GText variant="caption" style={styles.empty}>
                {tab === 'owned' ? 'No heroes here yet.' : 'New heroes are on the way. Pull down to check.'}
              </GText>
            )}

            <View style={styles.earnCard}>
              <CoinDot size={14} />
              <GText variant="caption" style={{ flex: 1, color: 'rgba(225,235,255,0.75)' }}>
                You are level {level}. 1 coin for every {XP_PER_COIN} XP: reps, matches, calories and daily quests all count
                {tabs.some((t) => t.key === 'level') ? ', and levels unlock free heroes.' : '.'}
              </GText>
            </View>
          </ScrollView>
      </View>

      {/* a hero opens full screen: their story movie, then their showcase */}
      {detail && (
        <HeroScreen hero={detail} status={statusOf(detail)} catalog={catalog} coins={coins} level={level} onClose={() => setDetailId(null)} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  glow: { position: 'absolute', top: -200, left: '30%', width: 700, height: 500, borderRadius: 350, backgroundColor: 'rgba(120,160,255,0.08)' },
  body: { flex: 1, flexDirection: 'row', gap: 16, paddingRight: 16, paddingBottom: 12 },

  rail: { width: 170, paddingTop: 10, paddingRight: 12, paddingLeft: 12, gap: 6, borderRightWidth: 1, borderTopRightRadius: 18 },
  railItem: { height: 50, justifyContent: 'center', paddingHorizontal: 18 },

  scroll: { paddingTop: 6, paddingBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  empty: { textAlign: 'center', marginTop: 24, color: 'rgba(225,235,255,0.7)' },

  earnCard: {
    marginTop: 18,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: HALL.line,
    backgroundColor: 'rgba(8,12,34,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
