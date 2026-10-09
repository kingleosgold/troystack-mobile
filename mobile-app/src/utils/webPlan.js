/**
 * TroyStack - Web plans
 *
 * A plan bought on troystack.ai lives in Stripe, not RevenueCat, so the app
 * asks the API about it. The answer lets a web subscriber have Gold in the app
 * and keeps the app from writing free over a plan it didn't sell.
 */

/**
 * The plan Stripe holds for the signed-in account, from GET /v1/stripe/my-plan.
 * @returns {Promise<'gold'|'lifetime'|null|undefined>} 'gold' or 'lifetime',
 *   null when Stripe has nothing, undefined when it couldn't tell (no session,
 *   offline, a slow answer, or an API without the route yet).
 */
export async function fetchWebPlan({ apiBase, token, fetchImpl = fetch, timeoutMs = 6000 }) {
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
