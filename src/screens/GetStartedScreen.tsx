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
      <ThemedStatusBar />

      <View style={styles.container}>

        {/* Top Brand Logo */}
        <View style={styles.header}>
          <Text style={styles.brandLogo}>Ojas</Text>
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
      backgroundColor: colors.bg,
    },

    container: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 28,
      justifyContent: 'space-between',
    },

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
      width: SCREEN_WIDTH - 40,
      height: 280,
    },

    /* ---------------- BOTTOM CONTENT ---------------- */

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