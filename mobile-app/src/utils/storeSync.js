/**
 * TroyStack - App Store plan sync
 *
 * Once migration 006 guards the plan columns on profiles, the app can't write
 * its own plan. A purchase made as a guest, or one a restore moved to this
 * account, never reaches a RevenueCat webhook under the account's id, so the
 * app asks the API to read the account's App Store plan from RevenueCat's REST
 * API and write it to profiles: POST /v1/revenuecat/sync, after Purchases.logIn
 * resolves and after a restore. The server's answer also shows in the app,
 * added on top of RevenueCat's and the web plan's answers the same way a web
 * plan is, never taking anything away. The app never writes it to profiles.
 */

/**
 * How long the app waits for the sync. The server gives RevenueCat up to ten
 * seconds and then reads and writes the profile, so this allows longer.
 */
export const STORE_SYNC_TIMEOUT_MS = 20000;

/**
 * POST /v1/revenuecat/sync with the Supabase session token and no body.
 * @returns {Promise<{ kind: 'plan', tier: 'free'|'gold'|'lifetime', expiresAt: string|null }
 *   | { kind: 'expired' } | { kind: 'not-ready' } | { kind: 'retry' }>}
 *   'plan' on 200. 'expired' on 401, or with no token: the session ran out.
 *   'not-ready' on 404 (the route isn't deployed yet) or 503 (the server has
 *   no RevenueCat key yet), both ignored. 'retry' on 429, 500, any other
 *   answer, a timeout or no connection, tried again on the next launch.
 */
export async function requestStoreSync({ apiBase, token, fetchImpl = fetch, timeoutMs = STORE_SYNC_TIMEOUT_MS }) {
  if (!token) return { kind: 'expired' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiBase}/v1/revenuecat/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status === 401) return { kind: 'expired' };
    if (res.status === 404 || res.status === 503) return { kind: 'not-ready' };
    if (!res.ok) return { kind: 'retry' };
    const body = await res.json();
    const tier = body?.tier;
    if (body?.success !== true || !['free', 'gold', 'lifetime'].includes(tier)) return { kind: 'retry' };
    return { kind: 'plan', tier, expiresAt: typeof body.expires_at === 'string' ? body.expires_at : null };
  } catch {
    return { kind: 'retry' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the sync for one account and says what to show, keyed to the account
 * the way web plan answers are: it asks only with that account's own session,
 * and an answer that comes back once another account is signed in is dropped.
 * Resolves to 'gold' or 'lifetime', null when the server holds no plan for
 * the account, or undefined when there's nothing to show.
 * @param {{
 *   userId: string,
 *   getSession: () => Promise<{ data?: { session?: { access_token?: string, user?: { id?: string } } | null } }>,
 *   stillSignedIn: (userId: string) => boolean,
 *   apiBase: string,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} args
 */
export async function syncStorePlanFor({ userId, getSession, stillSignedIn, apiBase, fetchImpl, timeoutMs }) {
  if (!userId) return undefined;
  let session = null;
  try {
    const answer = await getSession();
    session = answer?.data?.session || null;
  } catch {
    return undefined;
  }
  if (!session || session.user?.id !== userId) return undefined;
  const result = await requestStoreSync({ apiBase, token: session.access_token, fetchImpl, timeoutMs });
  if (result.kind !== 'plan' || !stillSignedIn(userId)) return undefined;
  return result.tier === 'gold' || result.tier === 'lifetime' ? result.tier : null;
}

/** The stronger of two plans: lifetime, then gold, then none. */
export function strongerPlan(a, b) {
  if (a === 'lifetime' || b === 'lifetime') return 'lifetime';
  if (a === 'gold' || b === 'gold') return 'gold';
  return null;
}

/**
 * A claim for the sync after Purchases.logIn, which runs at most once per
 * account per launch. The returned function is true the first time it's
 * called for an account, and false after that.
 */
export function oncePerAccount() {
  const claimed = new Set();
  return (userId) => {
    if (!userId || claimed.has(userId)) return false;
    claimed.add(userId);
    return true;
  };
}
