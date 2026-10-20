/**
 * TroyStack - reading Google sign in's redirect
 *
 * Supabase hands Google's tokens back in the redirect's hash. A redirect
 * with no access token, such as a refused consent (#error=access_denied),
 * or a browser result that isn't a success, signs no one in. Reporting it
 * as success would put the post sign in loading screen up with no account
 * to sync, and it would stay up until the app was relaunched.
 */

export const SIGN_IN_CANCELLED = 'Sign in cancelled';

/**
 * `{ accessToken, refreshToken }` for a redirect that carries a session,
 * else `{ error }` with a message for the sign in screen. A cancel, a
 * dismiss or a refused consent reads as cancelled, which the screen doesn't
 * show.
 */
export function readOAuthRedirect(result) {
  const type = result?.type;
  if (type === 'cancel' || type === 'dismiss') return { error: SIGN_IN_CANCELLED };
  if (type !== 'success' || typeof result.url !== 'string') {
    return { error: "Google sign in didn't finish. Please try again." };
  }
  let params;
  try {
    const url = new URL(result.url);
    params = new URLSearchParams(url.hash.substring(1));
    // Some errors come back in the query instead of the hash
    if (!params.get('access_token') && !params.get('error')) params = url.searchParams;
  } catch {
    return { error: "Google sign in didn't finish. Please try again." };
  }
  const accessToken = params.get('access_token');
  if (accessToken) return { accessToken, refreshToken: params.get('refresh_token') || '' };
  if (params.get('error') === 'access_denied') return { error: SIGN_IN_CANCELLED };
  return { error: params.get('error_description') || "Google sign in didn't finish. Please try again." };
}
