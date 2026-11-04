// Character creation (game style): pick a body (and a face, when the body has faces) on a lit arena
// stage, then READY. Shown once after sign-up, and from Profile > Customize. Bodies and faces are
// free, so equipping is enough.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Check, Smile, User, X } from 'lucide-react-native';
import { GText } from '../../../components/game';
import { GradientFill } from '../../../components/game/Gradient';
import { Slant } from '../../../components/game/Slant';
import { juice } from '../../../juice/juice';
import { useUserStore } from '../../../store/userStore';
import { useColors, type Palette } from '../../../theme';
import {
  AvatarModel,
  BUNDLED_AVATARS,
  equipAvatar,
  fetchAvatarCatalog,
  fitsCharacter,
  isAvatarOwned,
  getEquippedAvatarId,
  getLoadout,
  loadoutItems,
  resolveModelUrl,
  unequipSlot,
} from '../../../utils/avatarShopService';
import { AvatarViewer3D } from './AvatarViewer3D';
import { STORY_VIDEOS } from './HeroScreen';
import { CARD_ASPECT, HeroCard } from './HeroCard';

/** Key in AsyncStorage set once the player finished character creation (per user id). */
export const creatorDoneKey = (userId: string) => `ojas.characterCreated.${userId}`;

interface CreatorState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useCharacterCreator = create<CreatorState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

type Step = 'body' | 'face';

export const CharacterCreator: React.FC = () => {
  const c = useColors();
  const open = useCharacterCreator((s) => s.open);
  const hide = useCharacterCreator((s) => s.hide);
  const profile = useUserStore((s) => s.profile);
  const user = useUserStore((s) => s.user);
  const refreshProfile = useUserStore((s) => s.refreshProfile);

  const [catalog, setCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  const [step, setStep] = useState<Step>('body');
  const [row, setRow] = useState<{ w: number; h: number } | null>(null);
  const [bodyId, setBodyId] = useState<string>(getEquippedAvatarId(profile));
  const [faceId, setFaceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start from what the player wears now, every time the screen opens.
  useEffect(() => {
    if (!open) return;
    fetchAvatarCatalog().then(setCatalog).catch(() => {});
    const equipped = getEquippedAvatarId(profile);
    setBodyId(equipped);
    setFaceId(getLoadout(profile, equipped).face ?? null);
    setStep('body');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Your roster: the starters plus every character you bought or unlocked.
  const bodies = useMemo(() => catalog.filter((m) => m.category === 'character' && isAvatarOwned(profile, m)), [catalog, profile]);
  const body = bodies.find((b) => b.id === bodyId) ?? bodies[0] ?? BUNDLED_AVATARS[0];
  const film = STORY_VIDEOS[body.id];
  const faces = useMemo(() => catalog.filter((m) => m.category === 'face' && fitsCharacter(m, body)), [catalog, body]);
  const face = faces.find((f) => f.id === faceId) ?? null;
  // The face step only appears for a body that has faces to pick from.
  const faceStep = faces.length > 0;

  // The stage wears the chosen face plus whatever else is equipped on that body.
  const stageItems = useMemo(() => {
    const loadout = { ...getLoadout(profile, body.id), face: face?.id };
    if (!face) delete loadout.face;
    return loadoutItems(catalog, loadout, body);
  }, [catalog, profile, body, face]);

  const name = profile?.username || user?.user_metadata?.username || 'Athlete';

  const pickBody = (id: string) => {
    if (id === bodyId) return;
    juice.play('toggle');
    setBodyId(id);
    setFaceId(null); // faces belong to one body
  };

  const finish = async () => {
    setSaving(true);
    juice.play('ready');
    try {
      const steps: (() => Promise<{ ok: boolean; error?: string }>)[] = [];
      if (body.id !== getEquippedAvatarId(profile)) steps.push(() => equipAvatar(body.id));
      const currentFace = getLoadout(profile, body.id).face ?? null;
      if (face && face.id !== currentFace) steps.push(() => equipAvatar(face.id));
      if (!face && currentFace) steps.push(() => unequipSlot('face'));
      for (const run of steps) {
        const r = await run();
        if (!r.ok) {
          Alert.alert('Could not save your look', r.error || 'Please try again.');
          return;
        }
      }
      useUserStore.getState().noteEquipped(body.id);
      await refreshProfile();
      if (user?.id) AsyncStorage.setItem(creatorDoneKey(user.id), '1').catch(() => {});
      juice.play('level_up');
      hide();
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    // Closing counts as done: the default look is fine, and the screen stays in Profile > Customize.
    if (user?.id) AsyncStorage.setItem(creatorDoneKey(user.id), '1').catch(() => {});
    hide();
  };

  return (
    <Modal visible={open} animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={close} statusBarTranslucent>
      <View style={[styles.root, { backgroundColor: c.bg }]}>
        <StatusBar hidden />

        {/* Stage: dark arena, spotlight, the character on its platform */}
        <View style={styles.stage}>
          <GradientFill from="#3A3F5C" to="#12141F" direction="vertical" />
          <View style={styles.spot} pointerEvents="none" />
          {/* a hero with a film shows their picture from it */}
          {film ? (
            <Image source={film.still} style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} resizeMode="cover" />
          ) : (
            <AvatarViewer3D model={body} items={stageItems} autoRotate={false} interactive lively platform style={StyleSheet.absoluteFill} />
          )}
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <X size={20} color="#FFFFFF" strokeWidth={3} />
          </Pressable>
          <View style={styles.namePlate} pointerEvents="none">
            <Slant fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)" />
            <GText variant="display" size={20} style={{ color: '#FFFFFF' }} numberOfLines={1}>{name}</GText>
          </View>
          {!film && <GText variant="caption" style={styles.hint} pointerEvents="none">Drag to spin · Tap to cheer</GText>}
        </View>

        {/* Picker */}
        <View style={styles.side}>
          <View style={styles.titlePlate}>
            <Slant fill={c.accentFrom} to={c.accentTo} />
            <GText variant="display" size={20} tone="onGradient">Create your athlete</GText>
          </View>

          {faceStep && (
            <View style={styles.tabs}>
              {(
                [
                  { id: 'body', label: '1  Body', icon: User },
                  { id: 'face', label: '2  Face', icon: Smile },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = step === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      juice.play('toggle');
                      setStep(id);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={styles.tab}
                  >
                    <Slant fill={active ? c.text : c.raised} stroke={active ? undefined : c.edge} />
                    <Icon size={16} color={active ? c.raised : c.accent} />
                    <GText variant="label" size={14} style={{ color: active ? c.raised : c.text }}>{label.toUpperCase()}</GText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ flex: 1 }}>
            {step === 'body' ? (
              <View style={styles.bodyRow} onLayout={(e) => setRow({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
                {/* the same hero cards as the Shop, as tall as the row allows */}
                {row &&
                  bodies.map((b) => (
                    <HeroCard
                      key={b.id}
                      hero={b}
                      width={Math.min(row.h / CARD_ASPECT, (row.w - 12 * (bodies.length - 1)) / bodies.length)}
                      selected={b.id === body.id}
                      onPress={() => pickBody(b.id)}
                    />
                  ))}
              </View>
            ) : (
              <FlatList
                data={[null, ...faces]}
                keyExtractor={(f) => f?.id ?? 'default'}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingRight: 8 }}
                renderItem={({ item }) => (
                  <PickCard
                    label={item ? item.name : 'Original'}
                    image={item ? item.thumbnail_url : body.thumbnail_url}
                    selected={(item?.id ?? null) === (face?.id ?? null)}
                    onPress={() => {
                      juice.play('tap');
                      setFaceId(item?.id ?? null);
                    }}
                    c={c}
                  />
                )}
              />
            )}
          </View>

          <View style={styles.footer}>
            {step === 'body' ? (
              <GText variant="caption" tone="muted" style={{ flex: 1 }}>
                {faceStep ? 'Next, pick a face. ' : ''}You can change your look any time.
              </GText>
            ) : (
              <GText variant="caption" tone="muted" style={{ flex: 1 }}>{faces.length} faces · all free</GText>
            )}
            <Pressable
              onPress={() => {
                if (step === 'body' && faceStep) {
                  juice.play('tap');
                  setStep('face');
                } else finish();
              }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={step === 'body' && faceStep ? 'Next' : 'Ready'}
              style={({ pressed }) => [styles.ready, pressed && { transform: [{ translateY: 2 }] }]}
            >
              <Slant fill={c.accentLip} offsetY={4} />
              <View style={styles.readyFace}>
                <Slant fill={c.accentFrom} to={c.accentTo} />
                {saving ? (
                  <ActivityIndicator color={c.onGradient} />
                ) : (
                  <GText variant="hero" size={24} tone="onGradient">{step === 'body' && faceStep ? 'Next' : 'Ready!'}</GText>
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const PickCard: React.FC<{ label: string; image?: string | null; selected: boolean; onPress: () => void; c: Palette }> = ({
  label,
  image,
  selected,
  onPress,
  c,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected }}
    accessibilityLabel={label}
    style={({ pressed }) => [
      styles.card,
      { borderColor: selected ? c.accentFrom : c.edge, borderWidth: selected ? 3 : 1 },
      selected && { boxShadow: `0 0 0 3px ${c.accentTo}55` },
      pressed && { transform: [{ scale: 0.97 }] },
    ]}
  >
    <View style={[StyleSheet.absoluteFill, { backgroundColor: selected ? c.raised : c.surfaceSunken }]} />
    {image ? <Image source={{ uri: resolveModelUrl(image) }} style={styles.cardImage} resizeMode="contain" /> : <View style={styles.cardImage} />}
    <View style={[styles.cardLabel, { backgroundColor: selected ? c.accentFrom : 'rgba(0,0,0,0.04)' }]}>
      <GText variant="label" size={12} tone={selected ? 'onGradient' : 'text'} numberOfLines={1}>{label}</GText>
    </View>
    {selected && (
      <View style={[styles.check, { backgroundColor: c.accentFrom }]}>
        <Check size={12} color={c.onGradient} strokeWidth={3.5} />
      </View>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  stage: { width: '46%', overflow: 'hidden' },
  spot: { position: 'absolute', top: -120, alignSelf: 'center', width: 360, height: 520, borderRadius: 260, backgroundColor: 'rgba(255,230,200,0.10)' },
  close: { position: 'absolute', top: 14, left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  namePlate: { position: 'absolute', top: 14, right: 16, height: 38, paddingHorizontal: 22, justifyContent: 'center', maxWidth: '70%' },
  hint: { position: 'absolute', top: 60, right: 18, color: 'rgba(255,255,255,0.6)' },
  side: { flex: 1, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 12, gap: 10 },
  titlePlate: { height: 40, alignSelf: 'flex-start', paddingHorizontal: 26, justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: { height: 34, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bodyRow: { flex: 1, flexDirection: 'row', gap: 12, paddingVertical: 6 },
  card: { width: 132, borderRadius: 16, overflow: 'hidden' },
  cardImage: { flex: 1, width: '100%' },
  cardLabel: { paddingVertical: 5, alignItems: 'center' },
  check: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ready: { width: 190, height: 54 },
  readyFace: { height: 50, alignItems: 'center', justifyContent: 'center' },
});
