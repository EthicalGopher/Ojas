import React from 'react';
import { Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Dumbbell, Flame, ShoppingBag, Swords, Users, type LucideIcon } from 'lucide-react-native';
import LogoMark from '../../assets/logo-mark.svg';

// Brand colours, as on the splash screen: the same in light and dark mode.
const BG = '#222327';
const CARD = '#2B2D33';
const GOLD = '#C9A163';
const TEXT = '#F2F3F5';
const MUTED = '#9AA0AB';

const COVERS: { Icon: LucideIcon; label: string; color: string }[] = [
  { Icon: Swords, label: 'Battles and Human vs AI', color: '#E25822' },
  { Icon: Flame, label: 'Streaks, XP and ranks', color: '#FF7A45' },
  { Icon: Users, label: 'Squads and friends', color: '#60A5FA' },
  { Icon: Dumbbell, label: 'Training with the AI coach', color: '#10B981' },
  { Icon: ShoppingBag, label: 'The avatar shop', color: '#F472B6' },
];

interface AppTutorialProps {
  visible: boolean;
  /** Start the interactive tour (CoachMarks). */
  onStart: () => void;
  onSkip: () => void;
}

/** Welcome screen for new users, before the interactive tour of the real buttons. */
export const AppTutorial: React.FC<AppTutorialProps> = ({ visible, onStart, onSkip }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent supportedOrientations={['landscape', 'portrait']} onRequestClose={onSkip}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingLeft: Math.max(insets.left, 24), paddingRight: Math.max(insets.right, 24) }]}>
        {/* welcome and buttons on the left, what the tour covers on the right, so it fits a landscape phone */}
        <ScrollView style={styles.side} contentContainerStyle={styles.sideContent} showsVerticalScrollIndicator={false}>
          <View style={styles.halo}>
            <LogoMark width={46} height={46} />
          </View>
          <Text style={styles.tag}>WELCOME TO OJAS</Text>
          <Text style={styles.title}>Your AI coach lives in your camera</Text>
          <Text style={styles.body}>
            Let's walk through the app together. We'll point at each button and you tap it to see what it does.
          </Text>
          <TouchableOpacity style={styles.startBtn} onPress={onStart} activeOpacity={0.9} accessibilityRole="button">
            <Text style={styles.startText}>Start the tour</Text>
            <ChevronRight size={20} color="#11141A" strokeWidth={2.6} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onSkip} hitSlop={12} activeOpacity={0.7} accessibilityRole="button">
            <Text style={styles.skip}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>

        <ScrollView style={styles.side} contentContainerStyle={styles.sideContent} showsVerticalScrollIndicator={false}>
          <View style={styles.covers}>
            {COVERS.map(({ Icon, label, color }) => (
              <View key={label} style={styles.cover}>
                <View style={[styles.coverIcon, { backgroundColor: color + '26' }]}>
                  <Icon size={16} color={color} />
                </View>
                <Text style={styles.coverText}>{label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, flexDirection: 'row', gap: 24 },
  side: { flex: 1 },
  sideContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  halo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: GOLD + '55',
    backgroundColor: GOLD + '1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  tag: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 4 },
  title: { alignSelf: 'stretch', color: TEXT, fontSize: 22, lineHeight: 27, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  body: { color: MUTED, fontSize: 14, lineHeight: 19, textAlign: 'center', marginBottom: 12 },
  covers: { alignSelf: 'stretch', backgroundColor: CARD, borderRadius: 18, padding: 14, gap: 10 },
  cover: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coverIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  coverText: { color: TEXT, fontSize: 14.5, fontWeight: '600' },
  startBtn: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 320,
    height: 48,
    borderRadius: 16,
    marginBottom: 10,
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  startText: { color: '#11141A', fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
  skip: { color: MUTED, fontSize: 14.5, fontWeight: '700' },
});
