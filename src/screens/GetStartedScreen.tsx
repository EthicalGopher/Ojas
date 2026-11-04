import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';

import { makeStyles, ThemeColors, useColors } from '../theme';
import { ThemedStatusBar } from '../components/ThemedStatusBar';
import { GText, ScreenBackground } from '../components/game';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
      <ScreenBackground style={StyleSheet.absoluteFill} />
      <ThemedStatusBar />

      {/* Landscape: brand + animation on the left, headline and actions on the right. */}
      <View style={styles.container}>
        <View style={styles.leftCol}>

        {/* Top Brand Logo */}
        <View style={styles.header}>
          <GText variant="hero" size={52} tone="accent">Ojas</GText>
        </View>

        {/* Personal Training Animation */}
        <View style={styles.mascotContainer}>
          <LottieView
            source={require('../assets/animations/personal-training.json')}
            autoPlay
            loop
            speed={1}
            resizeMode="contain"
            style={styles.mascotAnimation}
          />
        </View>

        </View>

        {/* Bottom Content */}
        <View style={styles.bottomContent}>

          {/* Headline */}
          <Text style={styles.headline}>
            Train smarter.{'\n'}
            Duel in real-time.
          </Text>

          {/* Description */}
          <Text style={styles.subheadline}>
            Real-time AI pose tracking & 1v1 multiplayer workouts.
          </Text>

          {/* Get Started */}
          <TouchableOpacity
            style={styles.getStartedButton}
            activeOpacity={0.9}
            onPress={onGetStarted}
          >
            <Text style={styles.getStartedButtonText}>
              Get Started
            </Text>
          </TouchableOpacity>

          {/* Continue as Guest */}
          {onContinueAsGuest && (
            <TouchableOpacity
              style={styles.guestButton}
              activeOpacity={0.8}
              onPress={onContinueAsGuest}
            >
              <Text style={styles.guestButtonText}>
                Continue as Guest
              </Text>
            </TouchableOpacity>
          )}

          {/* Login */}
          <View style={styles.loginRow}>
            <Text style={styles.loginQuestion}>
              Already have an account?{' '}
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onLogIn}
            >
              <Text style={styles.loginLink}>
                Log In
              </Text>
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
      backgroundColor: 'transparent',
    },

    container: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingVertical: 16,
      gap: 24,
    },
    leftCol: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    /* ---------------- HEADER ---------------- */

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

    /* ---------------- ANIMATION ---------------- */

    mascotContainer: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },

    mascotAnimation: {
      width: SCREEN_WIDTH * 0.42,
      height: 250,
    },

    /* ---------------- BOTTOM CONTENT ---------------- */

    bottomContent: {
      alignItems: 'center',
      width: '46%',
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

    /* ---------------- GET STARTED BUTTON ---------------- */

    getStartedButton: {
      backgroundColor: '#E25822',
      width: '100%',
      paddingVertical: 16,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',

      shadowColor: '#E25822',
      shadowOffset: {
        width: 0,
        height: 6,
      },
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

    /* ---------------- GUEST BUTTON ---------------- */

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

    /* ---------------- LOGIN ---------------- */

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

  }),
);