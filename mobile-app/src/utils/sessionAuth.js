/**
 * TroyStack - the session token on calls that name a user
 *
 * Price alerts, notification settings, push registration, Troy's
 * conversations, transcribe and portfolio snapshots take a user id from the
 * app. The API checks that id against the Supabase session token the call
 * carries and refuses a token that names another account (its
 * middleware/user-token.js). So every call there that names a user sends the
 * signed-in session's access token, and a call made signed out sends none.
 */

import { withTimeout } from './webPlan.js';

/** How long reading the session may take before the call goes without it. */
export const SESSION_TOKEN_TIMEOUT_MS = 3000;

/**
 * `{ Authorization: 'Bearer <access token>' }` while signed in, `{}` signed
 * out. Also `{}` when the session can't be read in time or the read fails,
 * so the call still goes, without the token.
 * @param {{ getSession: () => Promise<{ data?: { session?: { access_token?: string } | null } }>, timeoutMs?: number }} args
 */
export async function sessionAuthHeader({ getSession, timeoutMs = SESSION_TOKEN_TIMEOUT_MS }) {
  try {
    const answer = await withTimeout(getSession(), timeoutMs);
    const token = answer?.data?.session?.access_token;
    return typeof token === 'string' && token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
