// Match energy on screen: a row of slanted bars (Shadow Fight 2 style) with the refill timer.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Zap } from 'lucide-react-native';
import { showAlert } from '../alert';
import { softShadow, useColors } from '../../theme';
import { useEnergy, hasEnergyForMatch } from '../../store/energyStore';
import { ENERGY_REGEN_MS, formatCountdown, type EnergyNow } from '../../utils/energyLogic';
import { GText } from './GText';

const ENERGY_BLUE = '#38BDF8';
const ENERGY_BLUE_DEEP = '#0EA5E9';

/** The bars only: full ones lit, the refilling one filling up, the rest empty. */
export const EnergyBars: React.FC<{ value: EnergyNow; barWidth?: number; barHeight?: number; gap?: number }> = ({
  value,
  barWidth = 9,
  barHeight = 14,
  gap = 3,
}) => {
  const c = useColors();
  const refillShare = value.msToNext === null ? 0 : 1 - value.msToNext / ENERGY_REGEN_MS;
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {Array.from({ length: value.max }, (_, i) => {
        const fill = i < value.energy ? 1 : i === value.energy ? refillShare : 0;
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: barHeight,
              borderRadius: 2,
              backgroundColor: c.surfaceSunken,
              borderWidth: 1,
              borderColor: fill >= 1 ? ENERGY_BLUE_DEEP : c.edge,
              overflow: 'hidden',
              transform: [{ skewX: '-14deg' }],
            }}
          >
            {fill > 0 && (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: `${Math.round(Math.min(1, fill) * 100)}%`,
                  backgroundColor: fill >= 1 ? ENERGY_BLUE : `${ENERGY_BLUE}66`,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
};

/** Top-bar chip: bolt, bars, and the time to the next bar while refilling. Tap for details. */
export const EnergyChip: React.FC = () => {
  const c = useColors();
  const value = useEnergy();
  const label =
    value.msToNext === null
      ? `Energy full, ${value.energy} of ${value.max}`
      : `Energy ${value.energy} of ${value.max}, next in ${formatCountdown(value.msToNext)}`;
  return (
    <Pressable onPress={showEnergyInfo} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <View style={[styles.chip, { backgroundColor: c.raised, borderColor: c.edge }, softShadow(c)]}>
        <Zap size={16} color={ENERGY_BLUE} fill={ENERGY_BLUE} />
        <EnergyBars value={value} />
        {value.msToNext !== null && (
          <GText variant="number" size={14} tone="muted" style={styles.timer}>
            {formatCountdown(value.msToNext)}
          </GText>
        )}
      </View>
    </Pressable>
  );
};

/** Big meter for alert boxes and the match result: bars, count and timers, live. */
export const EnergyPanel: React.FC = () => {
  const c = useColors();
  const value = useEnergy();
  return (
    <View style={[styles.panel, { backgroundColor: c.surfaceSunken, borderColor: c.edge }]}>
      <Zap size={22} color={ENERGY_BLUE} fill={ENERGY_BLUE} />
      <EnergyBars value={value} barWidth={18} barHeight={24} gap={5} />
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <GText variant="number" size={20}>
          {value.energy}/{value.max}
        </GText>
        <GText variant="caption" tone="muted">
          {value.msToNext === null ? 'Full' : `+1 in ${formatCountdown(value.msToNext)}`}
        </GText>
      </View>
    </View>
  );
};

const FullInLine: React.FC = () => {
  const value = useEnergy();
  if (value.msToNext === null) return null;
  return (
    <GText variant="caption" tone="muted">
      All bars back in {formatCountdown(value.msToFull)}
    </GText>
  );
};

/** What energy is, with the live meter. */
export function showEnergyInfo() {
  showAlert('Energy', 'Every match uses 1 energy. One bar comes back every 10 minutes. Training solo is always free.', [{ text: 'Got it' }], {
    tone: 'energy',
    cancelable: true,
    body: () => (
      <View style={{ gap: 6 }}>
        <EnergyPanel />
        <FullInLine />
      </View>
    ),
  });
}

/**
 * Call before starting anything that leads to a match. True when there is energy; otherwise it
 * shows the "out of energy" box with the countdown and returns false.
 */
export function requireEnergy(onTrainSolo?: () => void): boolean {
  if (hasEnergyForMatch()) return true;
  showAlert(
    'Out of energy',
    'You have used all your energy. One bar comes back every 10 minutes, or keep moving with a free solo workout.',
    onTrainSolo ? [{ text: 'Wait', style: 'cancel' }, { text: 'Train solo', onPress: onTrainSolo }] : [{ text: 'OK' }],
    { tone: 'energy', body: () => <EnergyPanel /> },
  );
  return false;
}

const styles = StyleSheet.create({
  chip: { height: 32, borderRadius: 16, paddingHorizontal: 10, gap: 7, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  timer: { minWidth: 34, textAlign: 'right' },
  panel: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
});
