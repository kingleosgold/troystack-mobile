import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../contexts/AuthContext';
import GoogleLogo from '../components/icons/GoogleLogo';

// App icon
const AppIcon = require('../../assets/icon.png');

type AuthMode = 'signIn' | 'signUp';

interface AuthScreenProps {
  onAuthSuccess?: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword, loading } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showStuckAlert, setShowStuckAlert] = useState(false);

  // Check Apple auth availability
  React.useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
  }, []);

  // Safety timeout: Show "stuck" alert after 30 seconds of loading
  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (loading) {
      setShowStuckAlert(false);
      timer = setTimeout(() => {
        setShowStuckAlert(true);
      }, 30000); // 30 seconds
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailAuth = async () => {
    setError(null);
    Keyboard.dismiss();

    const trimmedEmail = email.trim();

    // Validation
    if (!trimmedEmail) {
      setError('Please enter your email address');
      return;
    }
    if (!validateEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      if (mode === 'signUp') {
        const { error } = await signUp(trimmedEmail, password);
        if (error) {
          setError(error.message);
        } else {
          Alert.alert(
            'Check Your Email',
            'We sent you a confirmation link. Please check your email to verify your account.',
            [{ text: 'OK' }]
          );
        }
      } else {
        const { error } = await signIn(trimmedEmail, password);
        if (error) {
          setError(error.message);
        } else {
          onAuthSuccess?.();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        if (error.message !== 'Sign in cancelled') {
          setError(error.message);
        }
      } else {
        onAuthSuccess?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleAppleAuth = async () => {
    setError(null);
    try {
      const { error } = await signInWithApple();
      if (error) {
        if (error.message !== 'Sign in cancelled') {
          setError(error.message);
          // Show alert with full error details for iPad debugging
          Alert.alert('Apple Sign In Error', error.message);
        }
      } else {
        onAuthSuccess?.();
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to sign in with Apple';
      setError(msg);
      Alert.alert('Apple Sign In Error', msg);
    }
  };

  const handleForgotPassword = async () => {
    setResetError(null);
    Keyboard.dismiss();

    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setResetError('Please enter your email address');
      return;
    }
    if (!validateEmail(trimmed)) {
      setResetError('Please enter a valid email address');
      return;
    }

    setResetLoading(true);
    try {
      if (__DEV__) console.log('🔑 [ForgotPassword] Calling resetPassword for:', trimmed);
      const result = await resetPassword(trimmed);
      if (__DEV__) console.log('🔑 [ForgotPassword] Result:', JSON.stringify(result));
      if (result?.error) {
        if (__DEV__) console.log('🔑 [ForgotPassword] Error:', result.error.message);
        setResetError(result.error.message);
      } else {
        if (__DEV__) console.log('🔑 [ForgotPassword] Success - setting resetSuccess=true');
        setResetSuccess(true);
      }
    } catch (err: any) {
      if (__DEV__) console.log('🔑 [ForgotPassword] Caught exception:', err);
      setResetError(err.message || 'An unexpected error occurred');
    } finally {
      setResetLoading(false);
    }
  };

  const openForgotPassword = () => {
    setResetEmail(email.trim());
    setResetError(null);
    setResetSuccess(false);
    setShowForgotPassword(true);
  };

  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setError(null);
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <Image source={AppIcon} style={styles.logoImage} />
              <Text style={styles.logoTitle}>TroyStack</Text>
            </View>

            {/* Tab Selector */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, mode === 'signIn' && styles.tabActive]}
                onPress={() => { setMode('signIn'); setError(null); }}
              >
                <Text style={[styles.tabText, mode === 'signIn' && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === 'signUp' && styles.tabActive]}
                onPress={() => { setMode('signUp'); setError(null); }}
              >
                <Text style={[styles.tabText, mode === 'signUp' && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor="#52525b"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#52525b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="oneTimeCode"
                autoComplete="off"
                editable={!loading}
              />
            </View>

            {/* Forgot Password Link (Sign In only) */}
            {mode === 'signIn' && (
              <TouchableOpacity
                style={{ alignSelf: 'flex-end', marginTop: -8, marginBottom: 8 }}
                onPress={openForgotPassword}
              >
                <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: '500' }}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            )}

            {/* Confirm Password (Sign Up only) */}
            {mode === 'signUp' && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#52525b"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  textContentType="oneTimeCode"
                  editable={!loading}
                />
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#18181b" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signIn' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Auth Buttons */}
            <View style={styles.socialButtons}>
              {/* Google Button */}
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGoogleAuth}
                disabled={loading}
              >
                <GoogleLogo size={20} />
                <Text style={styles.socialButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Apple Button (iOS only) - Native Apple Sign In Button */}
              {Platform.OS === 'ios' && isAppleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={12}
                  style={styles.appleNativeButton}
                  onPress={handleAppleAuth}
                />
              )}
              {Platform.OS === 'ios' && !isAppleAvailable && (
                <View style={{ padding: 12, backgroundColor: 'rgba(239, 68, 68, 0.15)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  <Text style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>
                    Apple Sign In is not available on this device. Check Settings → Apple ID → Sign in.
                  </Text>
                </View>
              )}
            </View>

            {/* Switch Mode Link */}
            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>
                {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
              </Text>
              <TouchableOpacity onPress={switchMode} disabled={loading}>
                <Text style={styles.switchLink}>
                  {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                Your data is encrypted and secure.{'\n'}
                We never sell your data to third parties.
              </Text>
            </View>

            {/* Stuck Alert - shown after 30 seconds of loading */}
            {loading && showStuckAlert && (
              <View style={{
                backgroundColor: 'rgba(251, 191, 36, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(251, 191, 36, 0.3)',
                borderRadius: 12,
                padding: 16,
                marginTop: 16,
              }}>
                <Text style={{ color: '#fbbf24', fontSize: 15, fontWeight: '600', marginBottom: 8 }}>
                  Taking longer than expected...
                </Text>
                <Text style={{ color: '#a1a1aa', fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
                  Sign in is taking longer than usual. This could be due to a slow internet connection.
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#fbbf24',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setShowStuckAlert(false);
                    setError('Sign in timed out. Please try again.');
                  }}
                >
                  <Text style={{ color: '#18181b', fontSize: 14, fontWeight: '600' }}>
                    Cancel and Try Again
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotPassword}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowForgotPassword(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#09090b', padding: 24, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
            <Text style={{ color: '#e4e4e7', fontSize: 22, fontWeight: '700' }}>Reset Password</Text>
            <TouchableOpacity onPress={() => setShowForgotPassword(false)}>
              <Text style={{ color: '#71717a', fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>

          {resetSuccess ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>✉️</Text>
              <Text style={{ color: '#e4e4e7', fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
                Check your email
              </Text>
              <Text style={{ color: '#71717a', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
                We sent a password reset link to{'\n'}
                <Text style={{ color: '#fbbf24', fontWeight: '500' }}>{resetEmail.trim()}</Text>
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: '#fbbf24', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 32 }}
                onPress={() => setShowForgotPassword(false)}
              >
                <Text style={{ color: '#18181b', fontSize: 15, fontWeight: '700' }}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ color: '#71717a', fontSize: 14, lineHeight: 22, marginBottom: 24 }}>
                Enter your email address and we'll send you a link to reset your password.
              </Text>

              {resetError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{resetError}</Text>
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#52525b"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoFocus
                  editable={!resetLoading}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, resetLoading && styles.buttonDisabled]}
                onPress={handleForgotPassword}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#18181b" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 16,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e4e4e7',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#fbbf24',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#71717a',
  },
  tabTextActive: {
    color: '#18181b',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#e4e4e7',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#18181b',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: '#71717a',
    fontSize: 13,
    marginHorizontal: 16,
  },
  socialButtons: {
    gap: 12,
    marginBottom: 24,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 12,
  },
  socialButtonText: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },
  appleNativeButton: {
    width: '100%',
    height: 50,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  switchText: {
    color: '#71717a',
    fontSize: 14,
  },
  switchLink: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyNote: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  privacyText: {
    color: '#52525b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
