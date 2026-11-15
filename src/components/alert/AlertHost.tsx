import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Info, XCircle, Zap } from 'lucide-react-native';
import { GameButton } from '../game/GameButton';
import { GText } from '../game/GText';
import { Panel } from '../game/Panel';
import { useReducedMotion } from '../game/motion';
import { juice } from '../../juice/juice';
import { useColors, type Palette } from '../../theme';
import { AlertButton, AlertRequest, AlertTone, guessTone, useAlertStore } from './alertStore';

const TONE_ICON: Record<AlertTone, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  energy: Zap,
};

function toneColor(c: Palette, tone: AlertTone): string {
  switch (tone) {
    case 'success':
      return c.success;
    case 'warning':
      return c.win;
    case 'danger':
      return c.loss;
    case 'energy':
      return c.sky;
    default:
      return c.accent;
  }
}

/** Shows the first alert in the queue. Mounted once, at the top of the app. */
export const AlertHost: React.FC = () => {
  const current = useAlertStore((s) => s.queue[0]);
  return (
    <Modal
      visible={!!current}
      transparent
      animationType="none"
      statusBarTranslucent
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
      onRequestClose={() => current && pressBack(current)}
    >
      {current && <AlertBox key={current.id} alert={current} />}
    </Modal>
  );
};

function close(alert: AlertRequest, button?: AlertButton) {
  useAlertStore.getState().dismiss(alert.id);
  // after the box is gone, so the handler can open the next alert
  if (button?.onPress) setTimeout(() => void button.onPress?.(), 0);
}

/** Back button / outside tap: the cancel button if there is one; a single-button box closes too. */
function pressBack(alert: AlertRequest) {
  const cancel = alert.buttons.find((b) => b.style === 'cancel');
  if (cancel) return close(alert, cancel);
  if (alert.options.cancelable || alert.buttons.length === 1) close(alert, alert.options.cancelable ? undefined : alert.buttons[0]);
}

const AlertBox: React.FC<{ alert: AlertRequest }> = ({ alert }) => {
  const c = useColors();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pressed = useRef(false);
  const appear = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  const tone = alert.options.tone ?? guessTone(alert.title);
  const color = toneColor(c, tone);
  const Icon = TONE_ICON[tone];
  const hasCancel = alert.buttons.some((b) => b.style === 'cancel');

  useEffect(() => {
    juice.play(tone === 'danger' || tone === 'warning' ? 'toggle' : 'tap');
    if (reduced) return;
    Animated.spring(appear, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }).start();
  }, [appear, reduced, tone]);

  const press = (b: AlertButton) => {
    if (pressed.current) return;
    pressed.current = true;
    close(alert, b);
  };

  // the main action is the last button that is not cancel or destructive
  const primaryIndex = (() => {
    for (let i = alert.buttons.length - 1; i >= 0; i--) {
      const s = alert.buttons[i].style ?? 'default';
      if (s === 'default') return i;
    }
    return -1;
  })();

  const boxWidth = Math.min(460, width - 48);
  const stacked = alert.buttons.length === 3 && boxWidth < 420;

  return (
    <View style={styles.root}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        onPress={() => (alert.options.cancelable || hasCancel ? pressBack(alert) : undefined)}
        accessibilityLabel="Close"
      />
      <Animated.View
        accessibilityViewIsModal
        accessibilityLiveRegion="assertive"
        style={{
          width: boxWidth,
          opacity: appear,
          transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
        }}
      >
        <Panel tone="raised" radius={24} padding={0} style={{ overflow: 'hidden', maxHeight: height - 32 }}>
          {/* tone stripe */}
          <View style={[styles.stripe, { backgroundColor: color }]} />
          <View style={styles.inner}>
            <View style={styles.head}>
              <View style={[styles.iconRing, { borderColor: color, backgroundColor: `${color}22` }]}>
                <Icon size={22} color={color} strokeWidth={2.6} />
              </View>
              <GText variant="display" size={22} style={{ flex: 1 }} accessibilityRole="header">
                {alert.title}
              </GText>
            </View>
            {(!!alert.message || alert.options.body) && (
              <ScrollView style={{ maxHeight: Math.max(80, height - 220) }} contentContainerStyle={{ gap: 12 }} bounces={false}>
                {!!alert.message && (
                  <GText variant="body" tone="muted">
                    {alert.message}
                  </GText>
                )}
                {alert.options.body?.()}
              </ScrollView>
            )}
            <View style={[styles.buttons, stacked && { flexDirection: 'column' }]}>
              {alert.buttons.map((b, i) => {
                const s = b.style ?? 'default';
                const variant = s === 'destructive' ? 'danger' : i === primaryIndex ? 'primary' : 'secondary';
                return (
                  <GameButton
                    key={`${b.text}-${i}`}
                    label={b.text || 'OK'}
                    size="md"
                    variant={variant}
                    juiceEvent={null}
                    onPress={() => press(b)}
                    style={stacked ? undefined : { flex: 1, minWidth: 0 }}
                  />
                );
              })}
            </View>
          </View>
        </Panel>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  stripe: { height: 5 },
  inner: { padding: 20, paddingTop: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
