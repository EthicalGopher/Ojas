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
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
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
  unequipSlot,
} from '../../../utils/avatarShopService';
import { computeCoinBalance, XP_PER_COIN } from '../../../utils/gamification';
import { useUserStore } from '../../../store/userStore';
import { makeStyles, radius, ThemeColors, useColors } from '../../../theme';
import { GradientFill } from '../../squad/components/SquadUI';

export const RARITY_COLORS: Record<AvatarRarity, string> = {
  common: '#94A3B8',
  rare: '#38BDF8',
  epic: '#A78BFA',
  legendary: '#F59E0B',
};

const CATEGORIES: { key: ShopCategory; label: string }[] = [
  { key: 'character', label: 'Characters' },
  { key: 'outfit', label: 'Outfits' },
  { key: 'hair', label: 'Hair' },
  { key: 'accessory', label: 'Accessories' },
];

const SLOT_NAMES: Record<LoadoutSlot, string> = { outfit: 'outfit', hair: 'hair colour', accessory: 'accessory' };

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
  dot: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)' },
  ring: { borderWidth: 9 },
  initial: { fontSize: 46, fontWeight: '900' },
});

interface AvatarShopScreenProps {
  onBack: () => void;
}

/** The Shop tab: characters plus outfits, hair and accessories for them, with live try-on. */
export const AvatarShopScreen: React.FC<AvatarShopScreenProps> = ({ onBack }) => {
  const colors = useColors();
  const styles = useStyles();
  const profile = useUserStore((s) => s.profile);
  const isGuest = useUserStore((s) => s.isGuest);
  const refreshProfile = useUserStore((s) => s.refreshProfile);
  const filter = useUserStore((s) => s.shopFilter);
  const setFilter = useUserStore((s) => s.setShopFilter);

  const [catalog, setCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  const [category, setCategory] = useState<ShopCategory>('character');
  const [selectedId, setSelectedId] = useState<string>(getEquippedAvatarId(profile));
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const coins = computeCoinBalance(profile);
  const equippedId = getEquippedAvatarId(profile);
  const equippedCharacter = findAvatar(catalog, equippedId);
  const loadout = getLoadout(profile, equippedCharacter.id);

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
    return loadoutItems(catalog, base, stageCharacter.id);
  }, [catalog, profile, selected, stageCharacter.id]);

  const visibleItems = useMemo(
    () =>
      catalog.filter(
        (m) =>
          m.category === category &&
          (category === 'character' || fitsCharacter(m, equippedCharacter.id)) &&
          (filter === 'all' || isAvatarOwned(profile, m)),
      ),
    [catalog, category, equippedCharacter.id, filter, profile],
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

  const switchCategory = (key: ShopCategory) => {
    setCategory(key);
    // Keep the stage on what you are wearing in that slot, so switching tabs does not try things on
    if (key === 'character') setSelectedId(equippedId);
    else setSelectedId(loadout[key] ?? '');
  };

  const renderAction = () => {
    if (isBusy) {
      return (
        <View style={[styles.actionBtn, styles.actionBtnMuted]}>
          <ActivityIndicator color={colors.text} />
        </View>
      );
    }
    if (selected.category === 'character' && selectedId === '') return null;
    if (isWorn) {
      if (selected.category === 'character') {
        return (
          <View style={[styles.actionBtn, styles.actionBtnMuted]}>
            <Text style={[styles.actionText, { color: colors.text }]}>Your character</Text>
          </View>
        );
      }
      return (
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnMuted]}
          activeOpacity={0.85}
          onPress={() => run(() => unequipSlot(selected.category as LoadoutSlot), 'Could not remove')}
        >
          <Text style={[styles.actionText, { color: colors.text }]}>Take off</Text>
        </TouchableOpacity>
      );
    }
    if (isGuest) {
      return (
        <View style={[styles.actionBtn, styles.actionBtnMuted]}>
          <Text style={[styles.actionText, { color: colors.textMuted }]}>Sign in to collect items</Text>
        </View>
      );
    }
    if (selectedOwned) {
      return (
        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.85} onPress={() => run(() => equipAvatar(selected.id), 'Could not equip')}>
          <Text style={styles.actionText}>{selected.category === 'character' ? 'Play as ' + selected.name : 'Wear'}</Text>
        </TouchableOpacity>
      );
    }
    const affordable = coins >= selected.price_coins;
    return (
      <TouchableOpacity
        style={[styles.actionBtn, !affordable && styles.actionBtnLocked]}
        activeOpacity={0.85}
        onPress={() => handleBuy(selected)}
      >
        <Text style={[styles.actionText, !affordable && { color: colors.textMuted }]}>Buy</Text>
        <CoinDot size={14} />
        <Text style={[styles.actionText, !affordable && { color: colors.textMuted }]}>{selected.price_coins.toLocaleString()}</Text>
      </TouchableOpacity>
    );
  };

  const hasSelection = category === 'character' || !!catalog.find((m) => m.id === selectedId && m.category === category);

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.8} onPress={onBack}>
          <ArrowLeft size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Shop</Text>
        <View style={styles.coinPill}>
          <CoinDot />
          <Text style={styles.coinText}>{coins.toLocaleString()}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* STAGE */}
        <View style={styles.stage}>
          <GradientFill colors={['#2A2470', '#14112B']} vertical />
          <AvatarViewer3D model={stageCharacter} items={stageItems} style={styles.viewer} />
          {hasSelection && selected.category !== 'character' && !isWorn && (
            <View style={styles.tryOnChip} pointerEvents="none">
              <Text style={styles.tryOnText}>TRYING ON</Text>
            </View>
          )}
          <Text style={styles.stageHint} pointerEvents="none">Drag to spin</Text>
        </View>

        {/* CATEGORY TABS */}
        <View style={styles.categoryBar}>
          {CATEGORIES.map(({ key, label }) => {
            const active = category === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.categoryTab, active && styles.categoryTabActive]}
                activeOpacity={0.85}
                onPress={() => switchCategory(key)}
              >
                <Text style={[styles.categoryText, active && styles.categoryTextActive]} numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SELECTED ITEM */}
        {hasSelection ? (
          <View style={styles.detailCard}>
            <View style={styles.detailTop}>
              <Text style={styles.modelName} numberOfLines={1}>{selected.name}</Text>
              <Text style={[styles.rarityText, { color: RARITY_COLORS[selected.rarity] }]}>{selected.rarity.toUpperCase()}</Text>
            </View>
            {!!selected.description && <Text style={styles.modelDesc}>{selected.description}</Text>}
            {renderAction()}
          </View>
        ) : (
          <View style={styles.detailCard}>
            <Text style={styles.modelDesc}>
              No {SLOT_NAMES[category as LoadoutSlot]} on {equippedCharacter.name}. Pick one below to try it on.
            </Text>
          </View>
        )}

        {/* LIST HEADER */}
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {category === 'character' ? 'CHARACTERS' : `FOR ${equippedCharacter.name.toUpperCase()}`}
          </Text>
          <TouchableOpacity
            style={[styles.ownedToggle, filter === 'owned' && styles.ownedToggleOn]}
            activeOpacity={0.85}
            onPress={() => setFilter(filter === 'owned' ? 'all' : 'owned')}
          >
            <Text style={[styles.ownedToggleText, filter === 'owned' && styles.ownedToggleTextOn]}>Owned only</Text>
          </TouchableOpacity>
        </View>

        {/* GRID */}
        <View style={styles.grid}>
          {visibleItems.map((item) => {
            const owned = isAvatarOwned(profile, item);
            const isSelected = item.id === selectedId;
            const worn = item.category === 'character' ? item.id === equippedId : loadout[item.category as LoadoutSlot] === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, isSelected && { borderColor: colors.accent }]}
                activeOpacity={0.85}
                onPress={() => setSelectedId(item.id)}
              >
                <View style={styles.thumb}>
                  {item.thumbnail_url ? (
                    <Image source={{ uri: item.thumbnail_url }} style={styles.thumbImage} resizeMode="cover" />
                  ) : (
                    <SwatchArt item={item} />
                  )}
                  {worn && (
                    <View style={styles.wornBadge}>
                      <Text style={styles.wornText}>WEARING</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardRarity, { color: RARITY_COLORS[item.rarity] }]}>{item.rarity}</Text>
                  {owned ? (
                    <Text style={styles.cardOwned}>Owned</Text>
                  ) : (
                    <View style={styles.cardPrice}>
                      <CoinDot size={11} />
                      <Text style={styles.cardPriceText}>{item.price_coins.toLocaleString()}</Text>
                    </View>
                  )}
                </View>
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
          <Text style={styles.earnText}>
            Earn 1 coin for every {XP_PER_COIN} XP. Reps, matches, calories and daily challenges all count.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
    coinPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    coinText: { color: colors.text, fontSize: 13, fontWeight: '900' },
    scroll: { paddingHorizontal: 18, paddingBottom: 150 },

    stage: { height: 360, borderRadius: radius.xl, overflow: 'hidden' },
    viewer: { flex: 1 },
    stageHint: { position: 'absolute', bottom: 12, alignSelf: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700' },
    tryOnChip: {
      position: 'absolute',
      top: 12,
      left: 12,
      paddingHorizontal: 10,
      height: 24,
      borderRadius: 12,
      justifyContent: 'center',
      backgroundColor: 'rgba(251,191,36,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(251,191,36,0.5)',
    },
    tryOnText: { color: '#FBBF24', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

    categoryBar: {
      flexDirection: 'row',
      marginTop: 14,
      padding: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryTab: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    categoryTabActive: { backgroundColor: colors.accent },
    categoryText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '900' },
    categoryTextActive: { color: colors.onAccent },

    detailCard: {
      marginTop: 14,
      padding: 18,
      borderRadius: radius.xl,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    modelName: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '900' },
    rarityText: { fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
    modelDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 6 },
    actionBtn: {
      marginTop: 16,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.accent,
      borderBottomWidth: 3,
      borderBottomColor: '#9A3412',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    actionBtnMuted: { backgroundColor: colors.surfaceHi, borderBottomColor: colors.border },
    actionBtnLocked: { backgroundColor: colors.surfaceHi, borderBottomColor: colors.border },
    actionText: { color: colors.onAccent, fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },

    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
    listTitle: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    ownedToggle: {
      paddingHorizontal: 12,
      height: 30,
      borderRadius: radius.pill,
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    ownedToggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    ownedToggleText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },
    ownedToggleTextOn: { color: colors.onAccent },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    card: {
      width: '47%',
      flexGrow: 1,
      padding: 10,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
    },
    thumb: { height: 110, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
    thumbImage: { width: '100%', height: '100%' },
    wornBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      paddingHorizontal: 7,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      backgroundColor: colors.success,
    },
    wornText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    cardName: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: 10 },
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    cardRarity: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
    cardOwned: { color: colors.success, fontSize: 11, fontWeight: '900' },
    cardPrice: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cardPriceText: { color: colors.text, fontSize: 12.5, fontWeight: '900' },
    emptyText: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 16 },

    earnCard: { marginTop: 22, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceSunken },
    earnText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  }),
);
