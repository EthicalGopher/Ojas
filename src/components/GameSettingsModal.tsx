// Settings as a landscape game panel: sound on the left, pose engine (quality) choice on the right.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { Cpu, Music, Smartphone, Vibrate, Volume2, X } from 'lucide-react-native';
import { GameButton, GText, Panel } from './game';
import { Slant } from './game/Slant';
import { useJuiceSettings } from '../juice/juiceSettingsStore';
import { juice } from '../juice/juice';
import { useColors, type Palette } from '../theme';
import type { ModelComplexity } from '../utils/deviceSpecs';

const MODELS: { id: ModelComplexity; name: string; size: string; speed: number; accuracy: number }[] = [
  { id: 'light', name: 'Lite', size: '2.7 MB', speed: 3, accuracy: 1 },
  { id: 'medium', name: 'Full', size: '6.2 MB', speed: 2, accuracy: 2 },
  { id: 'high', name: 'Heavy', size: '27 MB', speed: 1, accuracy: 3 },
];

export const GameSettingsModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  selectedModel: ModelComplexity;
  onSelectModel: (model: ModelComplexity) => void;
  recommendedModel: ModelComplexity;
  deviceName: string;
  totalRamGb: number;
  /** Shown on the Heavy tile while its download pack is not ready. */
  heavyStatus?: string;
}> = ({ visible, onClose, selectedModel, onSelectModel, recommendedModel, deviceName, totalRamGb, heavyStatus }) => {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const s = useJuiceSettings();

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Close settings" />
      <View style={styles.wrap} pointerEvents="box-none">
        <Panel tone="raised" radius={24} padding={16} style={{ width: Math.min(760, width - 48), maxHeight: height - 32 }}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titlePlate}>
              <Slant fill={c.accentFrom} to={c.accentTo} />
              <GText variant="display" size={22} tone="onGradient">Settings</GText>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: c.surfaceHi, borderColor: c.edge }]}>
              <X size={18} color={c.text} strokeWidth={3} />
            </Pressable>
          </View>

          <View style={styles.columns}>
            {/* Sound & device */}
            <ScrollView style={styles.leftCol} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              <GText variant="label" tone="muted">SOUND & FEEL</GText>
              <ToggleRow icon={Music} label="Music" value={s.music} onChange={(v) => s.set({ music: v })} c={c} />
              <ToggleRow icon={Volume2} label="Sound effects" value={s.sfx} onChange={(v) => s.set({ sfx: v })} c={c} />
              <ToggleRow icon={Vibrate} label="Vibration" value={s.haptics} onChange={(v) => s.set({ haptics: v })} c={c} />

              <GText variant="label" tone="muted" style={{ marginTop: 6 }}>DEVICE</GText>
              <View style={[styles.device, { backgroundColor: c.surfaceSunken, borderColor: c.edge }]}>
                <Smartphone size={20} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <GText variant="bodyStrong" size={14} numberOfLines={1}>{deviceName}</GText>
                  <GText variant="caption" tone="muted">{totalRamGb} GB RAM</GText>
                </View>
              </View>
            </ScrollView>

            {/* Pose engine */}
            <View style={styles.rightCol}>
              <View style={styles.engineHead}>
                <Cpu size={14} color={c.textMuted} />
                <GText variant="label" tone="muted">POSE ENGINE</GText>
              </View>
              <View style={styles.tiles}>
                {MODELS.map((m) => {
                  const selected = selectedModel === m.id;
                  const status = m.id === 'high' ? heavyStatus : undefined;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => {
                        juice.play('toggle');
                        onSelectModel(m.id);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${m.name} engine, ${m.size}${recommendedModel === m.id ? ', recommended' : ''}`}
                      style={[
                        styles.tile,
                        { backgroundColor: selected ? c.surfaceHi : c.surfaceSunken, borderColor: selected ? c.accentFrom : c.edge, borderWidth: selected ? 2.5 : 1 },
                      ]}
                    >
                      {recommendedModel === m.id && (
                        <View style={[styles.ribbon, { backgroundColor: c.success }]}>
                          <GText variant="label" size={9} style={{ color: '#FFFFFF' }}>BEST</GText>
                        </View>
                      )}
                      <GText variant="display" size={22}>{m.name}</GText>
                      <GText variant="caption" tone="muted">{m.size}</GText>
                      <Bars label="Speed" value={m.speed} c={c} />
                      <Bars label="Accuracy" value={m.accuracy} c={c} />
                      {!!status && <GText variant="caption" size={10} tone="muted" numberOfLines={1}>{status}</GText>}
                    </Pressable>
                  );
                })}
              </View>
              <GameButton label="Done" size="md" onPress={onClose} style={{ alignSelf: 'flex-end', marginTop: 10 }} />
            </View>
          </View>
        </Panel>
      </View>
    </Modal>
  );
};

const ToggleRow: React.FC<{ icon: React.ComponentType<{ size?: number; color?: string }>; label: string; value: boolean; onChange: (v: boolean) => void; c: Palette }> = ({
  icon: Icon,
  label,
  value,
  onChange,
  c,
}) => (
  <View style={[styles.toggle, { backgroundColor: c.surfaceSunken, borderColor: c.edge }]}>
    <Icon size={18} color={c.accent} />
    <GText variant="bodyStrong" size={14} style={{ flex: 1 }}>{label}</GText>
    <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accentFrom, false: c.borderStrong }} thumbColor="#FFFFFF" accessibilityLabel={label} />
  </View>
);

const Bars: React.FC<{ label: string; value: number; c: Palette }> = ({ label, value, c }) => (
  <View style={styles.bars}>
    <GText variant="caption" size={10} tone="muted" style={{ width: 52 }}>{label}</GText>
    {[1, 2, 3].map((n) => (
      <View key={n} style={[styles.bar, { backgroundColor: n <= value ? c.accentFrom : c.borderStrong }]} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  titlePlate: { height: 38, paddingHorizontal: 26, justifyContent: 'center' },
  close: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  columns: { flexDirection: 'row', gap: 14, flexShrink: 1 },
  leftCol: { width: '36%', flexGrow: 0 },
  rightCol: { flex: 1 },
  engineHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 16, padding: 10, gap: 4, overflow: 'hidden' },
  ribbon: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 14, height: 6, borderRadius: 3 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, borderWidth: 1, minHeight: 46 },
  device: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
});
