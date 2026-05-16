import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Platform, Alert } from 'react-native';
import { Session, User, AuthError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { logLifecycleEvent } from '../utils/lifecycleLogger';

// Required for expo-auth-session
WebBrowser.maybeCompleteAuthSession();

// Types
interface LinkedProviders {
  google: boolean;
  apple: boolean;
  email: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  linkedProviders: LinkedProviders;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithApple: () => Promise<{ error: Error | null }>;
  linkWithGoogle: () => Promise<{ error: Error | null }>;
  linkWithApple: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
}

interface AuthProviderProps {
  children: ReactNode;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Google OAuth configuration
const GOOGLE_CLIENT_ID_IOS = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS || '';
const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || '';

// Helper to get linked providers from user
function getLinkedProviders(user: User | null): LinkedProviders {
  if (!user) {
    return { google: false, apple: false, email: false };
  }

  const identities = user.identities || [];
  return {
    google: identities.some((id) => id.provider === 'google'),
    apple: identities.some((id) => id.provider === 'apple'),
    email: identities.some((id) => id.provider === 'email') || !!user.email,
  };
}

// Provider component
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkedProviders, setLinkedProviders] = useState<LinkedProviders>({
    google: false,
    apple: false,
    email: false,
  });

  // Update linked providers when user changes
  useEffect(() => {
    setLinkedProviders(getLinkedProviders(user));
  }, [user]);

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      logLifecycleEvent('app:supabase_session_restored', { hasSession: !!session });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign up with email and password
  const signUp = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      // Add 30-second timeout for network issues
      const signUpPromise = supabase.auth.signUp({
        email,
        password,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign up timed out. Please check your internet connection and try again.')), 30000)
      );

      const result = await Promise.race([signUpPromise, timeoutPromise]) as any;
      return { error: result.error };
    } catch (error: any) {
      return { error: error as AuthError };
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign in with email and password
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      // Add 30-second timeout for network issues
      const signInPromise = supabase.auth.signInWithPassword({
        email,
        password,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timed out. Please check your internet connection and try again.')), 30000)
      );

      const result = await Promise.race([signInPromise, timeoutPromise]) as any;
      return { error: result.error };
    } catch (error: any) {
      return { error: error as AuthError };
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    try {
      setLoading(true);

      // Get the redirect URL
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'stacktrackergold',
        path: 'auth/callback',
      });

      // Create OAuth URL
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error('No OAuth URL returned');
      }

      // Open browser for OAuth with 60-second timeout protection
      const browserPromise = WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timed out after 60 seconds. Please try again.')), 60000)
      );

      const result = await Promise.race([browserPromise, timeoutPromise]) as any;

      if (result.type === 'success') {
        // Extract tokens from URL
        const url = new URL(result.url);
        const params = new URLSearchParams(url.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken) {
          // Set session manually
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (sessionError) {
            throw sessionError;
          }
        }
      } else if (result.type === 'cancel') {
        return { error: new Error('Sign in cancelled') };
      } else if (result.type === 'dismiss') {
        return { error: new Error('Sign in cancelled') };
      }

      return { error: null };
    } catch (error: any) {
      if (__DEV__) console.error('Google sign in error:', error);
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign in with Apple
  const signInWithApple = useCallback(async () => {
    try {
      setLoading(true);

      // Check if Apple Authentication is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (__DEV__) console.log('🍎 [Apple Auth] isAvailable:', isAvailable);
      if (!isAvailable) {
        throw new Error('Apple authentication is not available on this device');
      }

      // Generate a random nonce for security
      const rawNonce = Crypto.getRandomBytes(32);
      const nonce = Array.from(rawNonce)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

      // Hash the nonce with SHA256
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );

      if (__DEV__) console.log('🍎 [Apple Auth] Requesting credential...');

      // Request Apple credential with 60-second timeout protection
      const credentialPromise = AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Sign in timed out after 60 seconds. Please try again.')), 60000)
      );

      const credential = await Promise.race([credentialPromise, timeoutPromise]) as any;

      if (__DEV__) console.log('🍎 [Apple Auth] Got credential, hasToken:', !!credential?.identityToken);
      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      // Sign in with Supabase using the Apple token
      if (__DEV__) console.log('🍎 [Apple Auth] Signing in with Supabase...');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: nonce,
      });

      if (error) {
        if (__DEV__) console.error('🍎 [Apple Auth] Supabase error:', error.message);
        throw error;
      }

      if (__DEV__) console.log('🍎 [Apple Auth] Success');
      return { error: null };
    } catch (error: any) {
      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { error: new Error('Sign in cancelled') };
      }
      if (__DEV__) console.error('🍎 [Apple Auth] Error:', error.code, error.message, error);
      // Include error code in message for debugging in production
      const debugMsg = error.code
        ? `Apple Sign In failed (${error.code}): ${error.message}`
        : `Apple Sign In failed: ${error.message}`;
      return { error: new Error(debugMsg) };
    } finally {
      setLoading(false);
    }
  }, []);

  // Link Google account to existing user
  const linkWithGoogle = useCallback(async () => {
    try {
      setLoading(true);

      // Get the redirect URL
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: 'stacktrackergold',
        path: 'auth/callback',
      });

      // Create OAuth URL for linking
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.url) {
        throw new Error('No OAuth URL returned');
      }

      // Open browser for OAuth
      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl
      );

      if (result.type === 'success') {
        // Refresh the session to get updated user with new identity
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          if (__DEV__) console.error('Failed to refresh session after linking:', refreshError);
        }
        Alert.alert('Success', 'Google account linked successfully!');
      } else if (result.type === 'cancel') {
        return { error: new Error('Linking cancelled') };
      }

      return { error: null };
    } catch (error: any) {
      if (__DEV__) console.error('Google link error:', error);
      // Check for already linked error
      if (error.message?.includes('already linked') || error.message?.includes('identity_already_exists')) {
        Alert.alert('Already Linked', 'This Google account is already linked to another user.');
      }
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  // Link Apple account to existing user
  const linkWithApple = useCallback(async () => {
    try {
      setLoading(true);

      // Check if Apple Authentication is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple authentication is not available on this device');
      }

      // Generate a random nonce for security
      const rawNonce = Crypto.getRandomBytes(32);
      const nonce = Array.from(rawNonce)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');

      // Hash the nonce with SHA256
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );

      // Request Apple credential
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      // Link with Supabase using the Apple token
      const { error } = await supabase.auth.linkIdentity({
        provider: 'apple',
        options: {
          skipBrowserRedirect: true,
        },
      });

      // Note: Supabase's linkIdentity with Apple might need a different approach
      // For now, we'll try using signInWithIdToken which may automatically link
      // if the user is already signed in
      if (error) {
        // Try alternative approach - this may link if email matches
        const { error: idTokenError } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: nonce,
        });

        if (idTokenError) {
          throw idTokenError;
        }
      }

      // Refresh session to get updated identities
      await supabase.auth.refreshSession();
      Alert.alert('Success', 'Apple account linked successfully!');

      return { error: null };
    } catch (error: any) {
      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { error: new Error('Linking cancelled') };
      }
      if (__DEV__) console.error('Apple link error:', error);
      // Check for already linked error
      if (error.message?.includes('already linked') || error.message?.includes('identity_already_exists')) {
        Alert.alert('Already Linked', 'This Apple account is already linked to another user.');
      }
      return { error: error as Error };
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        if (__DEV__) console.error('Sign out error:', error);
        Alert.alert('Error', 'Failed to sign out. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset password (does not use context loading state - callers manage their own)
  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'stacktrackergold://auth/reset-password',
    });
    return { error };
  }, []);

  const value: AuthContextType = {
    user,
    session,
    loading,
    linkedProviders,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithApple,
    linkWithGoogle,
    linkWithApple,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Export types for use in other files
export type { AuthContextType, User, Session };
