/**
 * TroyStack - Web plans
 *
 * A plan bought on troystack.ai lives in Stripe, not RevenueCat, so the app
 * asks the API about it. The answer lets a web subscriber have Gold in the app
 * and keeps the app from writing free over a plan it didn't sell.
 */

/**
 * How long each step of a web plan check may take, the session read and the
 * API call each, so a whole check can take up to twice this.
 */
export const WEB_PLAN_TIMEOUT_MS = 6000;

/** What a check returns when another account is signed in by the time it runs. */
export const WEB_PLAN_WRONG_ACCOUNT = 'wrong-account';

/** The promise's answer, or a rejection once `ms` have passed. */
export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether to ask about the web plan again when the app comes back to the
 * foreground. Only while RevenueCat has nothing. A confirmed web plan is asked
 * about every fifteen minutes. No plan, or an answer that couldn't tell, is
 * asked about again after a minute, so a plan bought on troystack.ai a moment
 * ago shows up when the person switches back to the app.
 */
export function shouldRecheckWebPlan({ now, lastAt, lastPlan, rcHasPlan }) {
  if (rcHasPlan) return false;
  const since = now - (lastAt || 0);
  return lastPlan === 'gold' || lastPlan === 'lifetime' ? since >= 15 * 60 * 1000 : since >= 60 * 1000;
}

/**
 * Whether an answer from RevenueCat's customer info listener is about the
 * person using the app. Signed out, the anonymous customer's answer is theirs.
 * Signed in, only an answer while RevenueCat is on that same account counts:
 * right after an account switch that skips sign-out RevenueCat is still on the
 * last account for a moment, and at sign-out it moves to an anonymous customer
 * before the account has gone.
 */
export function revenueCatAnswerCounts({ signedInId, rcUserId }) {
  return !signedInId || rcUserId === signedInId;
}

/**
 * The plan Stripe holds for the signed-in account, from GET /v1/stripe/my-plan.
 * @returns {Promise<'gold'|'lifetime'|null|undefined>} 'gold' or 'lifetime',
 *   null when Stripe has nothing, undefined when it couldn't tell (no session,
 *   offline, a slow answer, or an API without the route yet).
 */
export async function fetchWebPlan({ apiBase, token, fetchImpl = fetch, timeoutMs = WEB_PLAN_TIMEOUT_MS }) {
  if (!token) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiBase}/v1/stripe/my-plan`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const body = await res.json();
    if (!body || typeof body !== 'object' || !('plan' in body)) return undefined;
    return body.plan === 'gold' || body.plan === 'lifetime' ? body.plan : null;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the app unlocks from RevenueCat's answer plus a web plan.
 * @param {{ rcGold: boolean, rcLifetime: boolean, rcTier: 'free'|'gold', webPlan: 'gold'|'lifetime'|null }} plans
 * @returns {{ hasGold: boolean, hasLifetime: boolean, tier: 'free'|'gold' }}
 */
export function mergePlans({ rcGold, rcLifetime, rcTier, webPlan }) {
  return {
    hasGold: Boolean(rcGold || webPlan),
    hasLifetime: Boolean(rcLifetime || webPlan === 'lifetime'),
    tier: rcTier === 'free' && webPlan ? 'gold' : rcTier,
  };
}

/** Where the last answer for an account is kept, so a check that can't tell doesn't take away Gold it confirmed before. */
export const webPlanCacheKey = (userId) => `stack_web_plan_${userId}`;

/**
 * The last confirmed web plan for an account, or null.
 * @param {{ getItem: (key: string) => Promise<string|null> }} storage AsyncStorage or a stand-in
 */
export async function readCachedWebPlan(storage, userId) {
  if (!userId) return null;
  try {
    const value = await storage.getItem(webPlanCacheKey(userId));
    return value === 'gold' || value === 'lifetime' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Keep a confirmed answer. A confirmed none is kept too, so an ended plan
 * isn't brought back by an old cached one.
 * @param {{ setItem: (key: string, value: string) => Promise<void> }} storage
 */
export async function cacheWebPlan(storage, userId, plan) {
  if (!userId || plan === undefined) return;
  try {
    await storage.setItem(webPlanCacheKey(userId), plan || 'none');
  } catch {
    // only a convenience
  }
}
