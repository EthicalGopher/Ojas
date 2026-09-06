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

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  onUserChange?: (user: any) => void;
  initialMode?: 'signin' | 'signup';
}

type AuthStep = 'welcome' | 'auth' | 'verify_email' | 'profile';

export const AuthModal: React.FC<AuthModalProps> = ({ visible, onClose, onUserChange, initialMode = 'signin' }) => {
  const [step, setStep] = useState<AuthStep>('auth');
  const [isSignUp, setIsSignUp] = useState<boolean>(initialMode === 'signup');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [fetchingUsername, setFetchingUsername] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [googleLoading, setGoogleLoading] = useState<boolean>(false);
  const [resending, setResending] = useState<boolean>(false);
  const [resendStatus, setResendStatus] = useState<string>('');
  const [user, setUser] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGenerateRandomUsername = async () => {
    setFetchingUsername(true);
    try {
      const generated = await generateRandomUsername();
      if (generated) setUsername(generated);
    } finally {
      setFetchingUsername(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setIsSignUp(initialMode === 'signup');
      setErrorMsg('');
      setResendStatus('');
      if (initialMode === 'signup' && !username) {
        handleGenerateRandomUsername();
      }
    }
  }, [visible, initialMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session?.user) {
        setUser(session.user);
        setStep('profile');
        if (onUserChange) onUserChange(session.user);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      if (session?.user) {
        setUser(session.user);
        setStep('profile');
        if (onUserChange) onUserChange(session.user);
      } else if (_event === 'SIGNED_OUT') {
        setUser(null);
        setStep('welcome');
        if (onUserChange) onUserChange(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuth = async () => {
    setErrorMsg('');
    setResendStatus('');
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
          },
        });
        if (error) {
          setErrorMsg(error.message);
        } else if (data.session) {
          setUser(data.user);
          setStep('profile');
          if (onUserChange) onUserChange(data.user);
        } else {
          setStep('verify_email');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          console.warn('[AuthModal] signIn error:', error);
          setErrorMsg(error.message || 'Invalid credentials or connection issue.');
        } else {
          setUser(data.user);
          setStep('profile');
          if (onUserChange) onUserChange(data.user);
        }
      }
    } catch (err: any) {
      console.warn('[AuthModal] exception:', err);
      setErrorMsg(err?.message || 'Network request failed. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) return;
    setResending(true);
    setErrorMsg('');
    setResendStatus('');
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        setResendStatus('Verification email resent successfully! Check your inbox.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to resend verification email.');
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
        if (res.error && !res.error.includes('canceled')) {
          setErrorMsg(res.error);
        }
      } else if (res.user) {
        setUser(res.user);
        setStep('profile');
        if (onUserChange) onUserChange(res.user);
        onClose();
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to sign in with Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (e) { }
    setUser(null);
    setStep('welcome');
    setEmail('');
    setPassword('');
    if (onUserChange) onUserChange(null);
    setLoading(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.titleWithBadge}>
              <Text style={styles.modalTitle}>
                {user ? 'Athlete Profile' : step === 'verify_email' ? 'Verify Email' : isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {user || step === 'profile' ? (
            <View style={styles.profileContainer}>
              <View style={styles.avatarLarge}>
                <Avatar username={user?.user_metadata?.username || user?.email || username || 'guest'} size={72} />
              </View>
              <Text style={styles.userNameText}>{user?.user_metadata?.username || username}</Text>
              <Text style={styles.userEmailText}>{user?.email}</Text>

              <View style={styles.statusBadge}>
                <View style={styles.greenDot} />
                <Text style={styles.statusBadgeText}>Active Athlete</Text>
              </View>

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

              <TouchableOpacity
                style={styles.signOutButton}
                activeOpacity={0.85}
                onPress={handleSignOut}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#11141A" />
                ) : (
                  <Text style={styles.signOutButtonText}>Sign Out</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : step === 'verify_email' ? (
            <View style={styles.verifyContainer}>
              <View style={styles.verifyIconBadge}>
                <Text style={{ fontSize: 30 }}>📬</Text>
              </View>
              <Text style={styles.verifyTitle}>Check Your Inbox</Text>
              <Text style={styles.verifyDescription}>
                We sent a verification link to:{'\n'}
                <Text style={styles.verifyHighlightEmail}>{email}</Text>
                {'\n\n'}
                Please verify your email to activate your account, then sign in.
              </Text>

              {resendStatus ? <Text style={styles.successText}>{resendStatus}</Text> : null}
              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

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
                <Text style={styles.primaryActionButtonText}>Proceed to Sign In →</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendButton}
                activeOpacity={0.8}
                onPress={handleResendVerification}
                disabled={resending}
              >
                {resending ? (
                  <ActivityIndicator color="#E8D5C4" size="small" />
                ) : (
                  <Text style={styles.resendButtonText}>Resend Verification Email</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formContainer}>
                {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

                {isSignUp && (
                  <View style={styles.inputGroup}>
                    <View style={styles.inputLabelRow}>
                      <Text style={styles.inputLabel}>Username</Text>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={styles.randomizeBtn}
                        onPress={handleGenerateRandomUsername}
                        disabled={fetchingUsername}
                      >
                        {fetchingUsername ? (
                          <ActivityIndicator size="small" color="#E8D5C4" />
                        ) : (
                          <Text style={styles.randomizeBtnText}>⚡ Randomize</Text>
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

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="athlete@example.com"
                    placeholderTextColor="#5A6679"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="••••••••"
                    placeholderTextColor="#5A6679"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>

                <TouchableOpacity
                  style={styles.primaryActionButton}
                  activeOpacity={0.88}
                  onPress={handleAuth}
                  disabled={loading || googleLoading}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryActionButtonText}>
                      {isSignUp ? 'Create Athlete Account' : 'Sign In'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* OAuth Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Google Sign In Button */}
                <TouchableOpacity
                  style={styles.googleButton}
                  activeOpacity={0.88}
                  onPress={handleGoogleSignIn}
                  disabled={loading || googleLoading}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <View style={styles.googleBtnContent}>
                      <Text style={styles.googleIconText}>G</Text>
                      <Text style={styles.googleButtonText}>
                        {isSignUp ? 'Sign up with Google' : 'Sign in with Google'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeButton}
                  onPress={() => {
                    setErrorMsg('');
                    setIsSignUp(!isSignUp);
                  }}
                >
                  <Text style={styles.switchModeText}>
                    {isSignUp ? 'Already have an account? ' : "New athlete? "}
                    <Text style={styles.switchModeHighlight}>
                      {isSignUp ? 'Sign In' : 'Sign Up'}
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

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 14, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '85%',
    backgroundColor: '#161F30',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#8E95A0',
    fontSize: 16,
    fontWeight: '700',
  },
  profileContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  avatarLarge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#1A2438',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E8D5C4',
  },
  userNameText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  userEmailText: {
    color: '#8E95A0',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 213, 196, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(232, 213, 196, 0.25)',
    marginBottom: 18,
  },
  greenDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#E8D5C4',
    marginRight: 6,
  },
  statusBadgeText: {
    color: '#E8D5C4',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  signOutButton: {
    backgroundColor: '#EF4444',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 6,
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  formContainer: {
    marginTop: 4,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: '#8E95A0',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  randomizeBtn: {
    backgroundColor: 'rgba(232, 213, 196, 0.15)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232, 213, 196, 0.3)',
  },
  randomizeBtnText: {
    color: '#E8D5C4',
    fontSize: 11,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: '#0D111A',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  primaryActionButton: {
    backgroundColor: '#E8D5C4',
    paddingVertical: 15,
    borderRadius: 26,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#E8D5C4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryActionButtonText: {
    color: '#11141A',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  switchModeButton: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchModeText: {
    color: '#8E95A0',
    fontSize: 13,
    fontWeight: '500',
  },
  switchModeHighlight: {
    color: '#E8D5C4',
    fontWeight: '800',
  },
  verifyContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  verifyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(232, 213, 196, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232, 213, 196, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  verifyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  verifyDescription: {
    color: '#8E95A0',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  verifyHighlightEmail: {
    color: '#E8D5C4',
    fontWeight: '800',
  },
  resendButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  resendButtonText: {
    color: '#8E95A0',
    fontSize: 12.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  successText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '800',
    marginHorizontal: 10,
    letterSpacing: 0.5,
  },
  googleButton: {
    backgroundColor: '#262A32',
    borderRadius: 26,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleIconText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
