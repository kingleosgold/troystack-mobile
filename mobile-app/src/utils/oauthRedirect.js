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
const NOT_FINISHED = "Google sign in didn't finish. Please try again.";

/**
 * `{ accessToken, refreshToken }` for a redirect that carries a session,
 * else `{ error }` with a message for the sign in screen. A cancel, a
 * dismiss or a refused consent reads as cancelled, which the screen doesn't
 * show. A refusal from Supabase itself carries an error_code and reads as
 * not finished. The server's own wording never reaches the screen.
 */
export function readOAuthRedirect(result) {
  const type = result?.type;
  if (type === 'cancel' || type === 'dismiss') return { error: SIGN_IN_CANCELLED };
  if (type !== 'success' || typeof result.url !== 'string') {
    return { error: NOT_FINISHED };
  }
  let params;
  try {
    const url = new URL(result.url);
    params = new URLSearchParams(url.hash.substring(1));
    // Some errors come back in the query instead of the hash
    if (!params.get('access_token') && !params.get('error')) params = url.searchParams;
  } catch {
    return { error: NOT_FINISHED };
  }
  const accessToken = params.get('access_token');
  if (accessToken) return { accessToken, refreshToken: params.get('refresh_token') || '' };
  if (params.get('error') === 'access_denied' && !params.get('error_code')) return { error: SIGN_IN_CANCELLED };
  return { error: NOT_FINISHED };
}

export const LINK_CANCELLED = 'Linking cancelled';
export const ALREADY_LINKED = 'This Google account is already linked to another user.';
const LINK_NOT_FINISHED = "Google linking didn't finish. Please try again.";

function errorCodeOf(result) {
  try {
    const url = new URL(result.url);
    return new URLSearchParams(url.hash.substring(1)).get('error_code') || url.searchParams.get('error_code');
  } catch {
    return null;
  }
}

/**
 * `{ linked: true }` for a link redirect that carries a session, else
 * `{ error }` for the account screen. Linking Google runs the same browser
 * round trip as signing in, so a refused consent or a dismiss reads as
 * cancelled, which the screen doesn't show, and only a redirect with a
 * session counts as linked.
 */
export function readLinkRedirect(result) {
  const read = readOAuthRedirect(result);
  if (!read.error) return { linked: true };
  if (read.error === SIGN_IN_CANCELLED) return { error: LINK_CANCELLED };
  if (errorCodeOf(result) === 'identity_already_exists') return { error: ALREADY_LINKED };
  return { error: LINK_NOT_FINISHED };
}
