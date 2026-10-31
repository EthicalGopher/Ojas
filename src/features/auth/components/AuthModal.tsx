import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';

import { supabase } from '../../../utils/supabase';
import { Avatar } from '../../../components/Avatar';
import { generateRandomUsername } from '../../../utils/usernameGenerator';
import { signInWithGoogleOAuth } from '../../../utils/googleAuth';

import { makeStyles, ThemeColors, useColors } from '../../../theme';
import { MailCheck, X, Eye, EyeOff } from 'lucide-react-native';

import Svg, { Path } from 'react-native-svg';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onUserChange?: (user: any) => void;
  initialMode?: 'signin' | 'signup';
}

type AuthStep = 'welcome' | 'auth' | 'verify_email' | 'profile';

export const AuthModal: React.FC<AuthModalProps> = ({
  visible,
  onClose,
  onUserChange,
  initialMode = 'signin',
}) => {
  const colors = useColors();
  const styles = useStyles();

  const [step, setStep] = useState<AuthStep>('auth');

  const [isSignUp, setIsSignUp] = useState<boolean>(
    initialMode === 'signup',
  );

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  const [showPassword, setShowPassword] =
    useState<boolean>(false);

  const [fetchingUsername, setFetchingUsername] =
    useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] =
    useState<boolean>(false);
  const [resending, setResending] =
    useState<boolean>(false);

  const [resendStatus, setResendStatus] =
    useState<string>('');

  const [user, setUser] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGenerateRandomUsername = async () => {
    setFetchingUsername(true);

    try {
      const generated = await generateRandomUsername();

      if (generated) {
        setUsername(generated);
      }
    } finally {
      setFetchingUsername(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setIsSignUp(initialMode === 'signup');
      setErrorMsg('');
      setResendStatus('');
      setShowPassword(false);

      if (initialMode === 'signup' && !username) {
        handleGenerateRandomUsername();
      }
    }
  }, [visible, initialMode]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(
        ({
          data: { session },
        }: {
          data: { session: any };
        }) => {
          if (session?.user) {
            setUser(session.user);
            setStep('profile');

            if (onUserChange) {
              onUserChange(session.user);
            }
          }
        },
      );

    const { data: authListener } =
      supabase.auth.onAuthStateChange(
        (_event: string, session: any) => {
          if (session?.user) {
            setUser(session.user);
            setStep('profile');

            if (onUserChange) {
              onUserChange(session.user);
            }
          } else if (_event === 'SIGNED_OUT') {
            setUser(null);
            setStep('welcome');

            if (onUserChange) {
              onUserChange(null);
            }
          }
        },
      );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async () => {
    setErrorMsg('');
    setResendStatus('');

    if (!email || !password) {
      setErrorMsg(
        'Please enter both email and password.',
      );
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                username,
              },
            },
          });

        if (error) {
          setErrorMsg(error.message);
        } else if (data.session) {
          setUser(data.user);
          setStep('profile');

          if (onUserChange) {
            onUserChange(data.user);
          }
        } else {
          setStep('verify_email');
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          console.warn(
            '[AuthModal] signIn error:',
            error,
          );

          setErrorMsg(
            error.message ||
              'Invalid credentials or connection issue.',
          );
        } else {
          setUser(data.user);
          setStep('profile');

          if (onUserChange) {
            onUserChange(data.user);
          }
        }
      }
    } catch (err: any) {
      console.warn(
        '[AuthModal] exception:',
        err,
      );

      setErrorMsg(
        err?.message ||
          'Network request failed. Please check your internet connection.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      return;
    }

    setResending(true);
    setErrorMsg('');
    setResendStatus('');

    try {
      const { error } =
        await supabase.auth.resend({
          type: 'signup',
          email,
        });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setResendStatus(
          'Verification email resent successfully! Check your inbox.',
        );
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'Failed to resend verification email.',
      );
    } finally {
      setResending(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setResendStatus('');
    setGoogleLoading(true);

    try {
      const res = await signInWithGoogleOAuth();

      if (!res.success) {
        if (
          res.error &&
          !res.error.includes('canceled')
        ) {
          setErrorMsg(res.error);
        }
      } else if (res.user) {
        setUser(res.user);
        setStep('profile');

        if (onUserChange) {
          onUserChange(res.user);
        }

        onClose();
      }
    } catch (e: any) {
      setErrorMsg(
        e?.message ||
          'Failed to sign in with Google.',
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);

    try {
      await supabase.auth.signOut();
    } catch (e) {}

    setUser(null);
    setStep('welcome');
    setEmail('');
    setPassword('');
    setShowPassword(false);

    if (onUserChange) {
      onUserChange(null);
    }

    setLoading(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>

          {/* HEADER */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.modalTitle}>
                {user
                  ? 'Athlete Profile'
                  : step === 'verify_email'
                  ? 'Verify Email'
                  : isSignUp
                  ? 'Create Account'
                  : 'Welcome Back'}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <X
                size={20}
                color={colors.textMuted}
                strokeWidth={2.5}
              />
            </TouchableOpacity>
          </View>

          {/* PROFILE */}
          {user || step === 'profile' ? (
            <View style={styles.profileContainer}>

              <View style={styles.avatarLarge}>
                <Avatar
                  username={
                    user?.user_metadata?.username ||
                    user?.email ||
                    username ||
                    'guest'
                  }
                  size={72}
                />
              </View>

              <Text style={styles.userNameText}>
                {user?.user_metadata?.username ||
                  username}
              </Text>

              <Text style={styles.userEmailText}>
                {user?.email}
              </Text>

              <View style={styles.statusBadge}>
                <View style={styles.greenDot} />

                <Text style={styles.statusBadgeText}>
                  ACTIVE ATHLETE
                </Text>
              </View>

              {errorMsg ? (
                <Text style={styles.errorText}>
                  {errorMsg}
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.signOutButton}
                activeOpacity={0.85}
                onPress={handleSignOut}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text
                    style={styles.signOutButtonText}
                  >
                    Sign Out
                  </Text>
                )}
              </TouchableOpacity>
            </View>

          ) : step === 'verify_email' ? (

            /* VERIFY EMAIL */
            <View style={styles.verifyContainer}>

              <View style={styles.verifyIconBadge}>
                <MailCheck
                  size={30}
                  color={colors.accent}
                  strokeWidth={2.2}
                />
              </View>

              <Text style={styles.verifyTitle}>
                Check Your Inbox
              </Text>

              <Text style={styles.verifyDescription}>
                We sent a verification link to:
                {'\n'}

                <Text
                  style={styles.verifyHighlightEmail}
                >
                  {email}
                </Text>

                {'\n\n'}

                Please verify your email to activate
                your account, then sign in.
              </Text>

              {resendStatus ? (
                <Text style={styles.successText}>
                  {resendStatus}
                </Text>
              ) : null}

              {errorMsg ? (
                <Text style={styles.errorText}>
                  {errorMsg}
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.primaryActionButton}
                activeOpacity={0.88}
                onPress={() => {
                  setIsSignUp(false);
                  setStep('auth');
                  setErrorMsg('');
                  setResendStatus('');
                }}
              >
                <Text
                  style={styles.primaryActionButtonText}
                >
                  Proceed to Sign In →
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendButton}
                activeOpacity={0.8}
                onPress={handleResendVerification}
                disabled={resending}
              >
                {resending ? (
                  <ActivityIndicator
                    color={colors.textMuted}
                    size="small"
                  />
                ) : (
                  <Text
                    style={styles.resendButtonText}
                  >
                    Resend Verification Email
                  </Text>
                )}
              </TouchableOpacity>
            </View>

          ) : (

            /* AUTH FORM */
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formContainer}>

                {/* ERROR */}
                {errorMsg ? (
                  <Text style={styles.errorText}>
                    {errorMsg}
                  </Text>
                ) : null}

                {/* USERNAME */}
                {isSignUp && (
                  <View style={styles.inputGroup}>

                    <View
                      style={styles.inputLabelRow}
                    >
                      <Text
                        style={styles.inputLabel}
                      >
                        USERNAME
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.randomizeBtn}
                        onPress={
                          handleGenerateRandomUsername
                        }
                        disabled={fetchingUsername}
                      >
                        {fetchingUsername ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.accent}
                          />
                        ) : (
                          <Text
                            style={
                              styles.randomizeBtnText
                            }
                          >
                            Randomize
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. shadow_runner"
                      placeholderTextColor="#5A6679"
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                    />
                  </View>
                )}

                {/* EMAIL */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    EMAIL ADDRESS
                  </Text>

                  <TextInput
                    style={styles.textInput}
                    placeholder="athlete@example.com"
                    placeholderTextColor="#5A6679"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                {/* PASSWORD */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    PASSWORD
                  </Text>

                  <View
                    style={
                      styles.passwordInputContainer
                    }
                  >
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="••••••••"
                      placeholderTextColor="#5A6679"
                      secureTextEntry={!showPassword}
                      value={password}
                      onChangeText={setPassword}
                    />

                    <TouchableOpacity
                      style={styles.eyeButton}
                      activeOpacity={0.7}
                      onPress={() =>
                        setShowPassword(
                          !showPassword,
                        )
                      }
                    >
                      {showPassword ? (
                        <EyeOff
                          size={20}
                          color={colors.textMuted}
                          strokeWidth={2}
                        />
                      ) : (
                        <Eye
                          size={20}
                          color={colors.textMuted}
                          strokeWidth={2}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* CREATE / SIGN IN */}
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  activeOpacity={0.88}
                  onPress={handleAuth}
                  disabled={
                    loading || googleLoading
                  }
                >
                  {loading ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={
                        styles.primaryActionButtonText
                      }
                    >
                      {isSignUp
                        ? 'Create account'
                        : 'Sign In'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* DIVIDER */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />

                  <Text style={styles.dividerText}>
                    OR
                  </Text>

                  <View style={styles.dividerLine} />
                </View>

                {/* GOOGLE */}
                <TouchableOpacity
                  style={styles.googleButton}
                  activeOpacity={0.88}
                  onPress={handleGoogleSignIn}
                  disabled={
                    loading || googleLoading
                  }
                >
                  {googleLoading ? (
                    <ActivityIndicator
                      color={colors.text}
                      size="small"
                    />
                  ) : (
                    <View
                      style={styles.googleBtnContent}
                    >
                      <Svg
                        width={20}
                        height={20}
                        viewBox="0 0 48 48"
                      >
                        <Path
                          fill="#FFC107"
                          d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"
                        />

                        <Path
                          fill="#FF3D00"
                          d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
                        />

                        <Path
                          fill="#4CAF50"
                          d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.6 35.1 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.1v5.3C9.5 39.4 16.2 44 24 44z"
                        />

                        <Path
                          fill="#1976D2"
                          d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.7 5.6-6.9 6.8l6.3 5.2C38.4 36.7 44 31.1 44 24c0-1.2-.1-2.4-.4-3.5z"
                        />
                      </Svg>

                      <Text
                        style={
                          styles.googleButtonText
                        }
                      >
                        Continue with Google
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* SWITCH SIGN IN / SIGN UP */}
                <TouchableOpacity
                  style={styles.switchModeButton}
                  activeOpacity={0.7}
                  onPress={() => {
                    setErrorMsg('');
                    setIsSignUp(!isSignUp);
                  }}
                >
                  <Text style={styles.switchModeText}>
                    {isSignUp
                      ? 'Already have an account? '
                      : 'New athlete? '}

                    <Text
                      style={
                        styles.switchModeHighlight
                      }
                    >
                      {isSignUp
                        ? 'Sign In'
                        : 'Sign Up'}
                    </Text>
                  </Text>
                </TouchableOpacity>

              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const useStyles = makeStyles(
  (colors: ThemeColors) =>
    StyleSheet.create({

      /* ================================
         MODAL
      ================================= */

      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 8, 14, 0.88)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 18,
      },

      modalCard: {
        width: '100%',
        maxWidth: 410,
        maxHeight: '88%',
        backgroundColor: colors.surface,
        borderRadius: 30,
        paddingHorizontal: 22,
        paddingTop: 22,
        paddingBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOffset: {
          width: 0,
          height: 18,
        },
        shadowOpacity: 0.45,
        shadowRadius: 28,
        elevation: 12,
      },

      /* ================================
         HEADER
      ================================= */

      headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
      },

      headerTextContainer: {
        flex: 1,
        paddingRight: 16,
      },

      modalTitle: {
        color: colors.text,
        fontSize: 25,
        fontWeight: '900',
        letterSpacing: -0.6,
      },

      closeBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.surfaceHi,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      },

      /* ================================
         FORM
      ================================= */

      formContainer: {
        width: '100%',
      },

      inputGroup: {
        marginBottom: 17,
      },

      inputLabelRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      },

      inputLabel: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        marginBottom: 7,
      },

      randomizeBtn: {
        backgroundColor:
          'rgba(226, 88, 34, 0.10)',
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor:
          'rgba(226, 88, 34, 0.28)',
        marginBottom: 4,
      },

      randomizeBtnText: {
        color: '#E25822',
        fontSize: 11,
        fontWeight: '800',
      },

      textInput: {
        backgroundColor: colors.surfaceSunken,
        borderRadius: 15,
        minHeight: 54,
        paddingHorizontal: 16,
        paddingVertical: 13,
        color: colors.text,
        fontSize: 15,
        borderWidth: 1,
        borderColor: colors.border,
      },

      /* ================================
         PASSWORD
      ================================= */

      passwordInputContainer: {
        backgroundColor: colors.surfaceSunken,
        borderRadius: 15,
        minHeight: 54,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
      },

      passwordInput: {
        flex: 1,
        minHeight: 52,
        paddingHorizontal: 16,
        paddingVertical: 13,
        color: colors.text,
        fontSize: 15,
      },

      eyeButton: {
        width: 50,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
      },

      /* ================================
         PRIMARY BUTTON
      ================================= */

      primaryActionButton: {
        backgroundColor: '#E25822',
        minHeight: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 3,

        shadowColor: '#E25822',
        shadowOffset: {
          width: 0,
          height: 7,
        },
        shadowOpacity: 0.28,
        shadowRadius: 14,
        elevation: 6,
      },

      primaryActionButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.1,
      },

      /* ================================
         DIVIDER
      ================================= */

      dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 20,
      },

      dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
      },

      dividerText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
        marginHorizontal: 12,
        letterSpacing: 1,
      },

      /* ================================
         GOOGLE
      ================================= */

      googleButton: {
        backgroundColor: colors.surfaceHi,
        minHeight: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
      },

      googleBtnContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 11,
      },

      googleButtonText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '800',
      },

      /* ================================
         SWITCH MODE
      ================================= */

      switchModeButton: {
        marginTop: 19,
        alignItems: 'center',
        paddingVertical: 5,
      },

      switchModeText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '500',
      },

      switchModeHighlight: {
        color: '#E25822',
        fontWeight: '900',
      },

      /* ================================
         ERROR / SUCCESS
      ================================= */

      errorText: {
        color: '#F87171',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 14,
        textAlign: 'center',
        backgroundColor:
          'rgba(248, 113, 113, 0.10)',
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor:
          'rgba(248, 113, 113, 0.18)',
      },

      successText: {
        color: '#34D399',
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 14,
        textAlign: 'center',
        backgroundColor:
          'rgba(52, 211, 153, 0.10)',
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor:
          'rgba(52, 211, 153, 0.18)',
      },

      /* ================================
         VERIFY EMAIL
      ================================= */

      verifyContainer: {
        alignItems: 'center',
        paddingVertical: 8,
      },

      verifyIconBadge: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor:
          'rgba(226, 88, 34, 0.10)',
        borderWidth: 1,
        borderColor:
          'rgba(226, 88, 34, 0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 17,
      },

      verifyTitle: {
        color: colors.text,
        fontSize: 23,
        fontWeight: '900',
        marginBottom: 9,
        letterSpacing: -0.4,
      },

      verifyDescription: {
        color: colors.textMuted,
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
      },

      verifyHighlightEmail: {
        color: colors.accent,
        fontWeight: '800',
      },

      resendButton: {
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderRadius: 14,
        marginTop: 10,
        alignItems: 'center',
      },

      resendButtonText: {
        color: colors.textMuted,
        fontSize: 12.5,
        fontWeight: '600',
        textDecorationLine: 'underline',
      },

      /* ================================
         PROFILE
      ================================= */

      profileContainer: {
        alignItems: 'center',
        paddingVertical: 8,
      },

      avatarLarge: {
        width: 82,
        height: 82,
        borderRadius: 41,
        backgroundColor: '#1A2438',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 13,
        borderWidth: 2,
        borderColor: colors.accent,
      },

      userNameText: {
        color: colors.text,
        fontSize: 21,
        fontWeight: '900',
        letterSpacing: -0.3,
      },

      userEmailText: {
        color: colors.textMuted,
        fontSize: 13,
        marginTop: 3,
        marginBottom: 14,
      },

      statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor:
          'rgba(226, 88, 34, 0.10)',
        paddingHorizontal: 13,
        paddingVertical: 6,
        borderRadius: 18,
        borderWidth: 1,
        borderColor:
          'rgba(226, 88, 34, 0.22)',
        marginBottom: 20,
      },

      greenDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#34D399',
        marginRight: 7,
      },

      statusBadgeText: {
        color: colors.accent,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
      },

      signOutButton: {
        backgroundColor: '#EF4444',
        width: '100%',
        minHeight: 52,
        borderRadius: 26,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 6,
      },

      signOutButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
      },
    }),
);