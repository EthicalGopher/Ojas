import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';
import { getOrCreateUserProfile } from './profileService';
import { useUserStore } from '../store/userStore';

// Complete any active web browser auth sessions
WebBrowser.maybeCompleteAuthSession();

const OFFLINE_MESSAGE = "Can't reach the server. Check your internet connection and try again.";

/** True when the auth server answers within a few seconds. Without this, a phone with no connection
 * opens a browser error page, the person closes it, and sign-in fails with no message. */
async function authServerReachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: ctrl.signal });
    return res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function signInWithGoogleOAuth(): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    // Generate native redirect URI
    const redirectUrl = AuthSession.makeRedirectUri({
      scheme: 'ojas',
      path: 'google-auth',
      preferLocalhost: false,
    });

    console.log('[GoogleAuth] Generated redirectUrl:', redirectUrl);

    if (!(await authServerReachable())) {
      return { success: false, error: OFFLINE_MESSAGE };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.warn('[GoogleAuth] signInWithOAuth error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.url) {
      return { success: false, error: 'No OAuth authentication URL returned by server.' };
    }

    console.log('[GoogleAuth] Opening auth session with data.url:', data.url);

    // Open in-app WebBrowser session to authenticate with Google
    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, {
      showInRecents: true,
    });
    console.log('[GoogleAuth] WebBrowser result type:', authResult.type);

    if (authResult.type === 'success' && authResult.url) {
      const url = authResult.url;
      let accessToken: string | null = null;
      let refreshToken: string | null = null;
      let authCode: string | null = null;

      // Extract tokens from hash fragment (#access_token=...&refresh_token=...) or query (?access_token=... or ?code=...)
      if (url.includes('#')) {
        const hash = url.split('#')[1];
        const params = new URLSearchParams(hash);
        accessToken = params.get('access_token');
        refreshToken = params.get('refresh_token');
      }
      
      if (url.includes('?')) {
        const query = url.split('?')[1].split('#')[0];
        const params = new URLSearchParams(query);
        if (!accessToken) accessToken = params.get('access_token');
        if (!refreshToken) refreshToken = params.get('refresh_token');
        authCode = params.get('code');
      }

      // If PKCE authorization code was returned instead of implicit hash
      if (authCode && (!accessToken || !refreshToken)) {
        console.log('[GoogleAuth] Exchanging auth code for session...');
        const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(authCode);
        if (!codeError && codeData?.user) {
          const authenticatedUser = codeData.user;
          const profile = await getOrCreateUserProfile(authenticatedUser);
          useUserStore.getState().setUser(authenticatedUser);
          useUserStore.getState().setProfile(profile);
          return { success: true, user: authenticatedUser };
        } else if (codeError) {
          console.warn('[GoogleAuth] Code exchange error:', codeError);
        }
      }

      if (accessToken && refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          return { success: false, error: sessionError.message };
        }

        const authenticatedUser = sessionData?.user;
        if (authenticatedUser) {
          // Synchronize profile (username, avatar_url, full_name) into profiles table
          try {
            const profile = await getOrCreateUserProfile(authenticatedUser);
            useUserStore.getState().setUser(authenticatedUser);
            useUserStore.getState().setProfile(profile);
          } catch (e) {
            console.warn('[GoogleAuth] Profile sync notice:', e);
          }
          return { success: true, user: authenticatedUser };
        }
      }

      // Check current session if redirect was handled via callback
      const { data: currentSession } = await supabase.auth.getSession();
      if (currentSession?.session?.user) {
        const user = currentSession.session.user;
        const profile = await getOrCreateUserProfile(user);
        useUserStore.getState().setUser(user);
        useUserStore.getState().setProfile(profile);
        return { success: true, user };
      }
    }

    if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
      return { success: false, error: 'Google sign-in was canceled.' };
    }

    return { success: false, error: 'Could not complete Google authentication.' };
  } catch (err: any) {
    console.error('[GoogleAuth] Exception:', err);
    return { success: false, error: err?.message || 'Failed to sign in with Google.' };
  }
}
