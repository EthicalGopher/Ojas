import React, { useState, useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, TextInput, View } from 'react-native';

import { supabase } from '../../../utils/supabase';
import { Avatar } from '../../../components/Avatar';
import { generateRandomUsername } from '../../../utils/usernameGenerator';
import { signInWithGoogleOAuth } from '../../../utils/googleAuth';

import { useColors, type Palette } from '../../../theme';
import { Dices, Eye, EyeOff, Lock, Mail, MailCheck, User, X } from 'lucide-react-native';
import { GameButton, GText, Panel, ScreenBackground } from '../../../components/game';
import { Slant } from '../../../components/game/Slant';
import { AvatarViewer3D } from '../../avatar/components/AvatarViewer3D';
import { BUNDLED_AVATARS } from '../../../utils/avatarShopService';
import { juice } from '../../../juice/juice';

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

  const switchMode = (signUp: boolean) => {
    if (signUp === isSignUp) return;
    juice.play('toggle');
    setErrorMsg('');
    setIsSignUp(signUp);
    if (signUp && !username) handleGenerateRandomUsername();
  };

  const busy = loading || googleLoading;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['landscape', 'portrait']}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <StatusBar hidden />
        <ScreenBackground style={StyleSheet.absoluteFill} />

        {/* Left: the game's hero shot */}
        <View style={styles.heroSide}>
          <GText variant="hero" size={54} tone="accent" style={styles.logo}>Ojas</GText>
          <GText variant="title" size={16} tone="muted" style={styles.tagline}>Train. Duel. Rank up.</GText>
          <View style={styles.stage}>
            <AvatarViewer3D model={HERO_MODEL} autoRotate={false} interactive lively platform style={StyleSheet.absoluteFill} />
          </View>
        </View>

        {/* Right: the form panel */}
        <View style={styles.formSide}>
          <Panel tone="raised" radius={24} padding={16} style={styles.panel}>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={[styles.closeBtn, { backgroundColor: colors.surfaceHi, borderColor: colors.edge }]}>
              <X size={18} color={colors.text} strokeWidth={3} />
            </Pressable>

            {user || step === 'profile' ? (
              /* SIGNED IN */
              <View style={styles.centerBlock}>
                <Avatar username={user?.user_metadata?.username || user?.email || username || 'guest'} size={72} />
                <GText variant="display" size={24} numberOfLines={1}>{user?.user_metadata?.username || username}</GText>
                <GText variant="caption" tone="muted" numberOfLines={1}>{user?.email}</GText>
                {!!errorMsg && <GText variant="caption" style={{ color: colors.danger }}>{errorMsg}</GText>}
                <GameButton label="Sign out" variant="secondary" size="md" onPress={handleSignOut} loading={loading} style={{ marginTop: 8 }} />
              </View>
            ) : step === 'verify_email' ? (
              /* VERIFY EMAIL */
              <View style={styles.centerBlock}>
                <View style={[styles.mailBadge, { backgroundColor: colors.surfaceHi }]}>
                  <MailCheck size={30} color={colors.accent} strokeWidth={2.2} />
                </View>
                <GText variant="display" size={24}>Check your inbox</GText>
                <GText variant="body" tone="muted" style={{ textAlign: 'center' }} numberOfLines={3}>
                  We sent a link to <GText variant="bodyStrong">{email}</GText>. Verify it, then sign in.
                </GText>
                {!!resendStatus && <GText variant="caption" style={{ color: colors.success, textAlign: 'center' }}>{resendStatus}</GText>}
                {!!errorMsg && <GText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{errorMsg}</GText>}
                <View style={styles.row}>
                  <GameButton label="Resend" variant="secondary" size="md" onPress={handleResendVerification} loading={resending} />
                  <GameButton
                    label="Sign in"
                    size="md"
                    onPress={() => {
                      setIsSignUp(false);
                      setStep('auth');
                      setErrorMsg('');
                      setResendStatus('');
                    }}
                  />
                </View>
              </View>
            ) : (
              /* SIGN IN / SIGN UP: fits without scrolling */
              <View style={styles.form}>
                <View style={styles.tabs}>
                  {([false, true] as const).map((signUp) => {
                    const active = isSignUp === signUp;
                    return (
                      <Pressable
                        key={String(signUp)}
                        onPress={() => switchMode(signUp)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        style={styles.tab}
                      >
                        <Slant fill={active ? colors.accentFrom : colors.surfaceHi} to={active ? colors.accentTo : undefined} stroke={active ? undefined : colors.edge} />
                        <GText variant="display" size={18} tone={active ? 'onGradient' : 'muted'}>
                          {signUp ? 'Sign up' : 'Sign in'}
                        </GText>
                      </Pressable>
                    );
                  })}
                </View>

                {isSignUp && (
                  <Field icon={User} c={colors}>
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="Player name"
                      placeholderTextColor={colors.textDim}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      accessibilityLabel="Player name"
                    />
                    <Pressable
                      onPress={() => {
                        juice.play('tap');
                        handleGenerateRandomUsername();
                      }}
                      disabled={fetchingUsername}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Random player name"
                      style={styles.fieldBtn}
                    >
                      {fetchingUsername ? <ActivityIndicator size="small" color={colors.accent} /> : <Dices size={20} color={colors.accent} />}
                    </Pressable>
                  </Field>
                )}

                <Field icon={Mail} c={colors}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Email"
                    placeholderTextColor={colors.textDim}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={email}
                    onChangeText={setEmail}
                    accessibilityLabel="Email"
                  />
                </Field>

                <Field icon={Lock} c={colors}>
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Password"
                    placeholderTextColor={colors.textDim}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handleAuth}
                    accessibilityLabel="Password"
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8} style={styles.fieldBtn} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
                  </Pressable>
                </Field>

                {!!errorMsg && (
                  <GText variant="caption" numberOfLines={2} style={{ color: colors.danger }}>{errorMsg}</GText>
                )}

                <View style={styles.actions}>
                  {/* Main action: angled game button */}
                  <Pressable
                    onPress={() => {
                      juice.play('ready');
                      handleAuth();
                    }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
                    style={({ pressed }) => [styles.enter, pressed && { transform: [{ translateY: 2 }] }, busy && { opacity: 0.7 }]}
                  >
                    <Slant fill={colors.accentLip} offsetY={4} />
                    <View style={styles.enterFace}>
                      <Slant fill={colors.accentFrom} to={colors.accentTo} />
                      {loading ? (
                        <ActivityIndicator color={colors.onGradient} />
                      ) : (
                        <GText variant="hero" size={24} tone="onGradient" numberOfLines={1}>
                          {isSignUp ? 'Create' : 'Play'}
                        </GText>
                      )}
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={handleGoogleSignIn}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Google"
                    style={({ pressed }) => [styles.google, { backgroundColor: colors.raised, borderColor: colors.edge }, pressed && { transform: [{ scale: 0.96 }] }]}
                  >
                    {googleLoading ? <ActivityIndicator color={colors.text} size="small" /> : <GoogleLogo />}
                    <GText variant="label" size={13}>Google</GText>
                  </Pressable>
                </View>
              </View>
            )}
          </Panel>
        </View>
      </View>
    </Modal>
  );
};

/** Icon + input row in the game style (no separate labels, so the form fits a landscape screen). */
const Field: React.FC<{ icon: React.ComponentType<{ size?: number; color?: string }>; c: Palette; children: React.ReactNode }> = ({ icon: Icon, c, children }) => (
  <View style={[styles.field, { backgroundColor: c.surfaceSunken, borderColor: c.edge }]}>
    <Icon size={18} color={c.accent} />
    {children}
  </View>
);

const GoogleLogo = () => (
  <Svg width={18} height={18} viewBox="0 0 48 48">
    <Path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
    <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
    <Path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.6 35.1 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.1v5.3C9.5 39.4 16.2 44 24 44z" />
    <Path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.7 5.6-6.9 6.8l6.3 5.2C38.4 36.7 44 31.1 44 24c0-1.2-.1-2.4-.4-3.5z" />
  </Svg>
);

const HERO_MODEL = BUNDLED_AVATARS[0];

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  heroSide: { width: '44%', paddingTop: 14, paddingLeft: 24 },
  logo: { zIndex: 2 },
  tagline: { marginTop: -6, zIndex: 2 },
  stage: { flex: 1, marginTop: -40 },
  formSide: { flex: 1, justifyContent: 'center', paddingVertical: 14, paddingRight: 20 },
  panel: { maxWidth: 460, width: '100%', alignSelf: 'center' },
  closeBtn: { position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  centerBlock: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  mailBadge: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  form: { gap: 10 },
  tabs: { flexDirection: 'row', gap: 6, marginRight: 44 },
  tab: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingLeft: 14, paddingRight: 8, borderRadius: 14, borderWidth: 1 },
  input: { flex: 1, height: '100%', fontSize: 15, fontWeight: '600', paddingVertical: 0 },
  fieldBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  enter: { flex: 1, height: 54 },
  enterFace: { height: 50, alignItems: 'center', justifyContent: 'center' },
  google: { height: 50, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
