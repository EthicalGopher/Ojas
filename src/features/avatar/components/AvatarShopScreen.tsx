import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ArrowLeft, Check, Crown, Palette, Shirt, Smile, Users } from 'lucide-react-native';
import { AvatarViewer3D } from './AvatarViewer3D';
import {
  AvatarModel,
  AvatarRarity,
  BUNDLED_AVATARS,
  LoadoutSlot,
  ShopCategory,
  equipAvatar,
  fetchAvatarCatalog,
  findAvatar,
  fitsCharacter,
  getEquippedAvatarId,
  getLoadout,
  isAvatarOwned,
  loadoutItems,
  purchaseAvatar,
  resolveModelUrl,
  unequipSlot,
} from '../../../utils/avatarShopService';
import { computeCoinBalance, XP_PER_COIN } from '../../../utils/gamification';
import { useUserStore } from '../../../store/userStore';
import { makeStyles, palettes, ThemeColors, useColors } from '../../../theme';
import { GradientFill } from '../../squad/components/SquadUI';

export const RARITY_COLORS: Record<AvatarRarity, string> = {
  common: '#94A3B8',
  rare: '#38BDF8',
  epic: '#A78BFA',
  legendary: '#F59E0B',
};

/** Pokemon GO style shop palette: sky teal stage, white sheet, teal actions. */
const SHOP = {
  skyTop: '#46C9C0',
  skyBottom: '#D7F5EE',
  ground: '#9BE3C9',
  teal: '#1FB5A8',
  tealDark: '#13877D',
  tile: '#EEF6F5',
  tileDark: '#1E2A2E',
};

/** Shop tabs. Colours groups the plain colour items (top / pants / shoes / hair) under one tab. */
type ShopTab = 'character' | 'face' | 'kit' | 'colours' | 'accessory';
const TABS: { key: ShopTab; label: string; Icon: typeof Users }[] = [
  { key: 'character', label: 'Avatar', Icon: Users },
  { key: 'face', label: 'Face', Icon: Smile },
  { key: 'kit', label: 'Outfits', Icon: Shirt },
  { key: 'colours', label: 'Colours', Icon: Palette },
  { key: 'accessory', label: 'Extras', Icon: Crown },
];
const COLOUR_SLOTS: { key: LoadoutSlot; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'pants', label: 'Pants' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'hair', label: 'Hair' },
];

const SLOT_NAMES: Record<LoadoutSlot, string> = {
  face: 'face',
  kit: 'outfit',
  top: 'top colour',
  pants: 'pants colour',
  shoes: 'shoes colour',
  hair: 'hair colour',
  accessory: 'extra',
};

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

/** Card art when an item has no thumbnail: its colour swatches on a rarity-tinted panel. */
const SwatchArt: React.FC<{ item: AvatarModel }> = ({ item }) => {
  const rarity = RARITY_COLORS[item.rarity];
  const swatch = item.config.swatch ?? (item.config.color ? [item.config.color] : []);
  return (
    <View style={swatchStyles.wrap}>
      <GradientFill colors={[`${rarity}40`, `${rarity}10`]} vertical />
      {item.category === 'character' || swatch.length === 0 ? (
        <Text style={[swatchStyles.initial, { color: rarity }]}>{item.name.charAt(0)}</Text>
      ) : (
        <View style={swatchStyles.row}>
          {swatch.slice(0, 2).map((c, i) => (
            <View
              key={c + i}
              style={[
                swatchStyles.dot,
                { backgroundColor: c, marginLeft: i === 0 ? 0 : -14, zIndex: 2 - i },
                item.category === 'accessory' && swatchStyles.ring,
                item.category === 'accessory' && { borderColor: c, backgroundColor: 'transparent' },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const swatchStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  ring: { borderWidth: 9 },
  initial: { fontSize: 46, fontWeight: '900' },
});

interface AvatarShopScreenProps {
  onBack: () => void;
}

/** The Shop tab, Pokemon GO style: the character on a sky stage, a white sheet of round category
 * buttons and item tiles below; tapping a tile tries it on, the floating button buys or wears it. */
export const AvatarShopScreen: React.FC<AvatarShopScreenProps> = ({ onBack }) => {
  const colors = useColors();
  const styles = useStyles();
  const { height: screenH } = useWindowDimensions();
  const profile = useUserStore((s) => s.profile);
  const isGuest = useUserStore((s) => s.isGuest);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const filter = useUserStore((s) => s.shopFilter);
  const setFilter = useUserStore((s) => s.setShopFilter);

  const [catalog, setCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  const [tab, setTab] = useState<ShopTab>('character');
  const [colourSlot, setColourSlot] = useState<LoadoutSlot>('top');
  const [selectedId, setSelectedId] = useState<string>(getEquippedAvatarId(profile));
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const coins = computeCoinBalance(profile);
  const equippedId = getEquippedAvatarId(profile);
  const equippedCharacter = findAvatar(catalog, equippedId);
  const loadout = getLoadout(profile, equippedCharacter.id);
  /** The category the grid shows. */
  const category: ShopCategory = tab === 'colours' ? colourSlot : tab;

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

  const selected = catalog.find((m) => m.id === selectedId) ?? equippedCharacter;
  const selectedOwned = isAvatarOwned(profile, selected);
  const isWorn =
    selected.category === 'character' ? selected.id === equippedId : loadout[selected.category as LoadoutSlot] === selected.id;

  // Try-on: the stage shows the selected character, or the equipped one wearing the selected item.
  const stageCharacter = selected.category === 'character' ? selected : equippedCharacter;
  const stageItems = useMemo(() => {
    const base = { ...getLoadout(profile, stageCharacter.id) };
    if (selected.category !== 'character') base[selected.category as LoadoutSlot] = selected.id;
    return loadoutItems(catalog, base, stageCharacter);
  }, [catalog, profile, selected, stageCharacter]);

  const visibleItems = useMemo(
    () =>
      catalog.filter(
        (m) =>
          m.category === category &&
          (category === 'character' || fitsCharacter(m, equippedCharacter)) &&
          (filter === 'all' || isAvatarOwned(profile, m)),
      ),
    [catalog, category, equippedCharacter, filter, profile],
  );

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, failTitle: string) => {
    setIsBusy(true);
    const result = await action();
    if (result.ok) await refreshProfile();
    else Alert.alert(failTitle, result.error || 'Please try again.');
    setIsBusy(false);
    return result.ok;
  };

  const handleBuy = (item: AvatarModel) => {
    if (item.notOnServer) {
      Alert.alert('Coming soon', `${item.name} goes on sale once the shop update is installed on the server. You can still try it on.`);
      return;
    }
    if (coins < item.price_coins) {
      Alert.alert(
        'Not enough coins',
        `${item.name} costs ${item.price_coins} coins and you have ${coins}. Earn ${item.price_coins - coins} more by training: every ${XP_PER_COIN} XP gives you 1 coin.`,
      );
      return;
    }
    Alert.alert(`Buy ${item.name}?`, `This spends ${item.price_coins} of your ${coins} coins.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          const ok = await run(() => purchaseAvatar(item.id), 'Purchase failed');
          if (ok) Alert.alert('Unlocked', `${item.name} is yours and you are wearing it now.`);
        },
      },
    ]);
  };

  // Keep the stage on what you are wearing in that slot, so switching tabs does not try things on
  const showSlot = (key: ShopCategory) => {
    if (key === 'character') setSelectedId(equippedId);
    else setSelectedId(loadout[key as LoadoutSlot] ?? '');
  };
  const switchTab = (key: ShopTab) => {
    setTab(key);
    showSlot(key === 'colours' ? colourSlot : key);
  };
  const switchColourSlot = (key: LoadoutSlot) => {
    setColourSlot(key);
    showSlot(key);
  };

  const hasSelection = category === 'character' || !!catalog.find((m) => m.id === selectedId && m.category === category);

  const renderAction = () => {
    if (isBusy) {
      return (
        <View style={[styles.actionBtn, styles.actionBtnMuted]}>
          <ActivityIndicator color={SHOP.tealDark} />
        </View>
      );
    }
    if (isWorn) {
      if (selected.category === 'character') {
        return (
          <View style={[styles.actionBtn, styles.actionBtnMuted]}>
            <Check size={16} color={SHOP.tealDark} strokeWidth={3} />
            <Text style={[styles.actionText, styles.actionTextMuted]}>Playing</Text>
          </View>
        );
      }
      return (
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnMuted]}
          activeOpacity={0.85}
          onPress={() => run(() => unequipSlot(selected.category as LoadoutSlot), 'Could not remove')}
        >
          <Text style={[styles.actionText, styles.actionTextMuted]}>Take off</Text>
        </TouchableOpacity>
      );
    }
    if (isGuest) {
      return (
        <View style={[styles.actionBtn, styles.actionBtnMuted]}>
          <Text style={[styles.actionText, styles.actionTextMuted]}>Sign in</Text>
        </View>
      );
    }
    if (selectedOwned) {
      return (
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={() => run(() => equipAvatar(selected.id), 'Could not equip')}>
          <Text style={styles.actionText}>{selected.category === 'character' ? 'Play' : 'Wear'}</Text>
        </TouchableOpacity>
      );
    }
    const affordable = coins >= selected.price_coins;
    return (
      <TouchableOpacity style={[styles.actionBtn, !affordable && styles.actionBtnLocked]} activeOpacity={0.85} onPress={() => handleBuy(selected)}>
        <CoinDot size={15} />
        <Text style={styles.actionText}>{selected.price_coins.toLocaleString()}</Text>
      </TouchableOpacity>
    );
  };

  const stageH = Math.max(340, Math.min(470, screenH * 0.5));

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={SHOP.teal} colors={[SHOP.teal]} />
        }
      >
        {/* STAGE */}
        <View style={[styles.stage, { height: stageH }]}>
          <GradientFill colors={[SHOP.skyTop, SHOP.skyBottom]} vertical />
          <View style={styles.ground} pointerEvents="none" />
          <AvatarViewer3D model={stageCharacter} items={stageItems} style={styles.viewer} />

          <View style={styles.stageTop} pointerEvents="box-none">
            <TouchableOpacity style={styles.roundBtn} activeOpacity={0.8} onPress={onBack}>
              <ArrowLeft size={20} color={SHOP.tealDark} strokeWidth={2.6} />
            </TouchableOpacity>
            <View style={styles.coinPill}>
              <CoinDot size={16} />
              <Text style={styles.coinText}>{coins.toLocaleString()}</Text>
            </View>
          </View>

          {hasSelection && selected.category !== 'character' && !isWorn && (
            <View style={styles.tryOnChip} pointerEvents="none">
              <Text style={styles.tryOnText}>TRYING ON</Text>
            </View>
          )}

          {/* selected item plate + action, floating over the stage like PoGo's purchase bar */}
          <View style={styles.plate}>
            {hasSelection ? (
              <>
                <View style={styles.plateInfo}>
                  <Text style={styles.plateName} numberOfLines={1}>{selected.name}</Text>
                  <View style={styles.plateMeta}>
                    <View style={[styles.rarityDot, { backgroundColor: RARITY_COLORS[selected.rarity] }]} />
                    <Text style={styles.plateRarity}>{selected.rarity}</Text>
                    {selected.category !== 'character' && (
                      <Text style={styles.plateFor} numberOfLines={1}>· for {equippedCharacter.name}</Text>
                    )}
                  </View>
                </View>
                {renderAction()}
              </>
            ) : (
              <Text style={styles.plateHint}>
                No {SLOT_NAMES[category as LoadoutSlot]} on {equippedCharacter.name}. Tap one below to try it on.
              </Text>
            )}
          </View>
        </View>

        {/* CATEGORY BUTTONS (sticky) */}
        <View style={styles.sheetTop}>
          <View style={styles.tabRow}>
            {TABS.map(({ key, label, Icon }) => {
              const active = tab === key;
              return (
                <TouchableOpacity key={key} style={styles.tabItem} activeOpacity={0.85} onPress={() => switchTab(key)}>
                  <View style={[styles.tabCircle, active && styles.tabCircleActive]}>
                    <Icon size={22} color={active ? '#FFFFFF' : SHOP.tealDark} strokeWidth={2.4} />
                  </View>
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {tab === 'colours' && (
            <View style={styles.subRow}>
              {COLOUR_SLOTS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.subChip, colourSlot === key && styles.subChipActive]}
                  activeOpacity={0.85}
                  onPress={() => switchColourSlot(key)}
                >
                  <Text style={[styles.subChipText, colourSlot === key && styles.subChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ITEMS */}
        <View style={styles.sheet}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>
              {category === 'character' ? 'Avatars' : `${TABS.find((t) => t.key === tab)?.label} for ${equippedCharacter.name}`}
            </Text>
            <TouchableOpacity
              style={[styles.ownedToggle, filter === 'owned' && styles.ownedToggleOn]}
              activeOpacity={0.85}
              onPress={() => setFilter(filter === 'owned' ? 'all' : 'owned')}
            >
              <Text style={[styles.ownedToggleText, filter === 'owned' && styles.ownedToggleTextOn]}>Owned</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.grid}>
            {visibleItems.map((item) => {
              const owned = isAvatarOwned(profile, item);
              const isSelected = item.id === selectedId;
              const worn = item.category === 'character' ? item.id === equippedId : loadout[item.category as LoadoutSlot] === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.tile, isSelected && styles.tileSelected]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedId(item.id)}
                >
                  <View style={styles.tileArt}>
                    {item.thumbnail_url ? (
                      <Image source={{ uri: resolveModelUrl(item.thumbnail_url) }} style={styles.thumbImage} resizeMode="contain" />
                    ) : (
                      <SwatchArt item={item} />
                    )}
                  </View>
                  {worn ? (
                    <View style={styles.wornBadge}>
                      <Check size={12} color="#FFFFFF" strokeWidth={3.5} />
                    </View>
                  ) : null}
                  {!owned && (
                    <View style={styles.tilePrice}>
                      <CoinDot size={11} />
                      <Text style={styles.tilePriceText}>{item.price_coins.toLocaleString()}</Text>
                    </View>
                  )}
                  <View style={styles.tileFooter}>
                    <Text style={styles.tileName} numberOfLines={1}>{item.name}</Text>
                  </View>
                  <View style={[styles.rarityBar, { backgroundColor: RARITY_COLORS[item.rarity] }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {visibleItems.length === 0 && (
            <Text style={styles.emptyText}>
              {filter === 'owned' ? 'Nothing owned here yet.' : 'New drops are on the way. Pull down to check.'}
            </Text>
          )}

          <View style={styles.earnCard}>
            <CoinDot size={14} />
            <Text style={styles.earnText}>
              1 coin for every {XP_PER_COIN} XP. Reps, matches, calories and daily challenges all count.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    scroll: { paddingBottom: 150 },

    stage: { overflow: 'hidden' },
    ground: {
      position: 'absolute',
      left: '-20%',
      right: '-20%',
      bottom: -140,
      height: 260,
      borderRadius: 400,
      backgroundColor: SHOP.ground,
    },
    viewer: { flex: 1, marginBottom: 64 },
    stageTop: {
      position: 'absolute',
      top: 12,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    roundBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#0B3B36',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    coinPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      height: 40,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: '#FFFFFF',
      elevation: 4,
      shadowColor: '#0B3B36',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    coinText: { color: '#1C2B2A', fontSize: 15, fontWeight: '900' },
    tryOnChip: {
      position: 'absolute',
      top: 68,
      left: 16,
      paddingHorizontal: 12,
      height: 26,
      borderRadius: 13,
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.85)',
    },
    tryOnText: { color: SHOP.tealDark, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },

    plate: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 14,
      minHeight: 64,
      paddingLeft: 16,
      paddingRight: 8,
      paddingVertical: 8,
      borderRadius: 22,
      backgroundColor: '#FFFFFF',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      elevation: 6,
      shadowColor: '#0B3B36',
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    },
    plateInfo: { flex: 1 },
    plateName: { color: '#1C2B2A', fontSize: 17, fontWeight: '900' },
    plateMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    rarityDot: { width: 8, height: 8, borderRadius: 4 },
    plateRarity: { color: '#5E7270', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
    plateFor: { flexShrink: 1, color: '#8AA09D', fontSize: 12, fontWeight: '700' },
    plateHint: { flex: 1, color: '#5E7270', fontSize: 13, fontWeight: '700', paddingVertical: 10, paddingRight: 8 },
    actionBtn: {
      minWidth: 108,
      height: 48,
      paddingHorizontal: 18,
      borderRadius: 24,
      backgroundColor: SHOP.teal,
      borderBottomWidth: 4,
      borderBottomColor: SHOP.tealDark,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    actionBtnMuted: { backgroundColor: '#E4F3F1', borderBottomColor: '#C6E2DE' },
    actionBtnLocked: { backgroundColor: '#9FB8B5', borderBottomColor: '#7F9996' },
    actionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
    actionTextMuted: { color: SHOP.tealDark },

    sheetTop: {
      marginTop: -18,
      paddingTop: 16,
      paddingBottom: 10,
      paddingHorizontal: 12,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: colors.surface,
    },
    tabRow: { flexDirection: 'row', justifyContent: 'space-between' },
    tabItem: { flex: 1, alignItems: 'center', gap: 5 },
    tabCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 2.5,
      borderColor: '#BFE6E1',
    },
    tabCircleActive: { backgroundColor: SHOP.teal, borderColor: SHOP.tealDark },
    tabLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },
    tabLabelActive: { color: SHOP.tealDark },
    subRow: { flexDirection: 'row', gap: 8, marginTop: 12, paddingHorizontal: 4 },
    subChip: {
      flex: 1,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceHi,
    },
    subChipActive: { backgroundColor: SHOP.teal },
    subChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '800' },
    subChipTextActive: { color: '#FFFFFF' },

    sheet: { paddingHorizontal: 14, backgroundColor: colors.surface },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, marginBottom: 12 },
    listTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
    ownedToggle: {
      paddingHorizontal: 14,
      height: 30,
      borderRadius: 15,
      justifyContent: 'center',
      backgroundColor: colors.surfaceHi,
    },
    ownedToggleOn: { backgroundColor: SHOP.teal },
    ownedToggleText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    ownedToggleTextOn: { color: '#FFFFFF' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      width: '31.3%',
      aspectRatio: 0.82,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors === palettes.light ? SHOP.tile : SHOP.tileDark,
      borderWidth: 2.5,
      borderColor: 'transparent',
    },
    tileSelected: { borderColor: SHOP.teal },
    tileArt: { flex: 1, padding: 6 },
    thumbImage: { width: '100%', height: '100%' },
    wornBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#22C55E',
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
    tileFooter: { height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    tileName: { color: colors.text, fontSize: 11, fontWeight: '800' },
    tilePrice: {
      position: 'absolute',
      top: 6,
      left: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#FFFFFF',
    },
    tilePriceText: { color: '#1C2B2A', fontSize: 11.5, fontWeight: '900' },
    rarityBar: { height: 4 },
    emptyText: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 16 },

    earnCard: {
      marginTop: 22,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.surfaceHi,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    earnText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  }),
);
