import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { YOGA_MASCOT_SVG, PUSHUPS_MASCOT_SVG } from '../assets/mascots';

import { makeStyles, ThemeColors, useColors } from '../theme';
import { ThemedStatusBar } from '../components/ThemedStatusBar';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MASCOT_WIDTH = (SCREEN_WIDTH - 48) / 2;

interface GetStartedScreenProps {
  onGetStarted: () => void;
  onLogIn: () => void;
  onContinueAsGuest?: () => void;
}

export const GetStartedScreen: React.FC<GetStartedScreenProps> = ({
  onGetStarted,
  onLogIn,
  onContinueAsGuest,
}) => {
  const colors = useColors();
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedStatusBar />
      <View style={styles.container}>
        {/* Top Brand Logo */}
        <View style={styles.header}>
          <Text style={styles.brandLogo}>Ojas</Text>
        </View>

        {/* Floating Mascot Vector Artwork (No Cards) */}
        <View style={styles.mascotsContainer}>
          <View style={styles.mascotWrapper}>
            <SvgXml
              xml={YOGA_MASCOT_SVG}
              width={MASCOT_WIDTH}
              height={220}
            />
          </View>

          <View style={styles.mascotWrapper}>
            <SvgXml
              xml={PUSHUPS_MASCOT_SVG}
              width={MASCOT_WIDTH}
              height={220}
            />
          </View>
        </View>

        {/* Bottom Clean Typography & Actions */}
        <View style={styles.bottomContent}>
          <Text style={styles.headline}>
            Train smarter.{'\n'}Duel in real-time.
          </Text>
          <Text style={styles.subheadline}>
            Real-time AI pose tracking & 1v1 multiplayer workouts.
          </Text>

          {/* Primary Action Button */}
          <TouchableOpacity
            style={styles.getStartedButton}
            activeOpacity={0.9}
            onPress={onGetStarted}
          >
            <Text style={styles.getStartedButtonText}>Get Started</Text>
          </TouchableOpacity>

          {/* Continue as Guest (Offline Mode) Button */}
          {onContinueAsGuest && (
            <TouchableOpacity
              style={styles.guestButton}
              activeOpacity={0.8}
              onPress={onContinueAsGuest}
            >
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </TouchableOpacity>
          )}

          {/* Log In Link */}
          <View style={styles.loginRow}>
            <Text style={styles.loginQuestion}>Already have an account? </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={onLogIn}>
              <Text style={styles.loginLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: 8,
  },
  brandLogo: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.5,
  },
  mascotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginVertical: 'auto',
    gap: 8,
  },
  mascotWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomContent: {
    alignItems: 'center',
    width: '100%',
  },
  headline: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subheadline: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  getStartedButton: {
    backgroundColor: '#E25822',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E25822',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  getStartedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  guestButton: {
    backgroundColor: colors.surfaceHi,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  guestButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  loginQuestion: {
    color: colors.textMuted,
    fontSize: 13.5,
    fontWeight: '500',
  },
  loginLink: {
    color: '#E25822',
    fontSize: 13.5,
    fontWeight: '800',
  },
})
);
