import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Modal, useWindowDimensions, View } from 'react-native';
import type { Palette } from '../../theme';
import { usePalette } from '../../theme/PaletteContext';
import { juice } from '../../juice/juice';
import type { JuiceEvent } from '../../juice/juiceLogic';
import { GameButton } from './GameButton';
import { MomentWord, type MomentTone } from './MomentWord';
import { useReducedMotion } from './motion';
import { Panel } from './Panel';

export interface MomentOverlayProps {
  visible: boolean;
  title: string;
  tone?: MomentTone;
  juiceEvent?: JuiceEvent;
  children?: React.ReactNode;
  actionLabel?: string;
  onDismiss: () => void;
  palette?: Palette;
}

const Staged: React.FC<{ index: number; children: React.ReactNode }> = ({ index, children }) => {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: 200, delay: 220 + index * 120, useNativeDriver: true }).start();
  }, [index, reduced, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
};

/** Full-screen moment (level up, rank up): MomentWord over a white card (design 3.3, 3.10). */
export const MomentOverlay: React.FC<MomentOverlayProps> = ({ visible, title, tone = 'accent', juiceEvent, children, actionLabel = 'Continue', onDismiss, palette }) => {
  const c = usePalette(palette);
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (!visible) return;
    juice.play(juiceEvent);
    AccessibilityInfo.announceForAccessibility(title);
  }, [visible, juiceEvent, title]);

  const items = React.Children.toArray(children);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View
        style={{ flex: 1, backgroundColor: c.scrim, alignItems: 'center', paddingTop: height * 0.3 - 40 }}
        onTouchStart={() => juice.unlock()}
      >
        <View style={{ zIndex: 1 }}>{visible && <MomentWord text={title} tone={tone} palette={c} />}</View>
        <Panel tone="raised" palette={c} padding={20} style={{ marginTop: -24, paddingTop: 36, width: Math.min(340, width - 32), gap: 12 }}>
          {items.map((child, i) => (
            <Staged key={i} index={i}>
              {child}
            </Staged>
          ))}
          <Staged index={items.length}>
            <GameButton label={actionLabel} size="md" palette={c} onPress={onDismiss} style={{ alignSelf: 'center' }} />
          </Staged>
        </Panel>
      </View>
    </Modal>
  );
};
