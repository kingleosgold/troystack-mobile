/**
 * TroyStack - What Gold offers, said the way it really works
 *
 * Upgrade prompts promise a free trial only when this Apple ID can still get
 * one, using the same RevenueCat eligibility check as the Gold screen, and
 * describe Troy's limits the way the server enforces them. Nothing here
 * imports React Native, so it runs under `node --test`.
 */

// Troy's daily limits as the API enforces them in src/routes/troy-chat.js:
// GOLD_DAILY_LIMIT questions a day, and a Gold voice limit of 20 a day
// (dailyLimit in handleSpeak and in /transcribe). Both routes count against
// the same voice_usage_<user>_<New York date> key, so asking Troy out loud
// and hearing his answers use the same 20, and the count starts over at
// midnight Eastern time.
export const TROY_GOLD_DAILY_QUESTIONS = 30;
export const TROY_GOLD_DAILY_VOICE = 20;
// The app stops a free account at 3 questions a day (TROY_FREE_LIMIT in App.js).
export const TROY_FREE_DAILY_QUESTIONS = 3;

// RevenueCat's INTRO_ELIGIBILITY_STATUS_ELIGIBLE.
export const INTRO_ELIGIBLE = 2;

/**
 * The free trial on a subscription product that this Apple ID can still get,
 * as { count, unit } with unit 'day' or 'month', or null. Anything short of
 * ELIGIBLE reads as no trial, since RevenueCat advises plain pricing when
 * eligibility is unknown.
 */
export function freeTrialPeriod(product, eligibility, eligibleStatus = INTRO_ELIGIBLE) {
  const intro = product?.introPrice;
  if (!intro || intro.price !== 0) return null;
  if (eligibility?.[product.identifier]?.status !== eligibleStatus) return null;
  const n = (intro.periodNumberOfUnits || 0) * (intro.cycles || 1);
  const unit = String(intro.periodUnit || '').toUpperCase();
  const days = unit === 'DAY' ? n : unit === 'WEEK' ? n * 7 : 0;
  if (days > 0) return { count: days, unit: 'day' };
  if (unit === 'MONTH' && n > 0) return { count: n, unit: 'month' };
  return null;
}

/** "7 days" or "1 month", or "7 Days" when capitalized. null without a trial. */
export function trialLabel(period, { capitalized = false } = {}) {
  if (!period) return null;
  const word = period.count === 1 ? period.unit : `${period.unit}s`;
  return `${period.count} ${capitalized ? word.charAt(0).toUpperCase() + word.slice(1) : word}`;
}

/**
 * The free trial an upgrade prompt can promise: the first of the offering's
 * yearly and monthly plans whose trial this Apple ID can still get, with the
 * plan it belongs to as cycle ('yearly' or 'monthly'), the Gold screen's
 * billingCycle values. A prompt that promises it opens the Gold screen on that
 * plan, so the trial is one tap away. Yearly comes first because the Gold
 * screen opens on it otherwise.
 */
export function offeringFreeTrial(offering, eligibility, eligibleStatus = INTRO_ELIGIBLE) {
  const plans = [
    { pkg: offering?.annual, cycle: 'yearly' },
    { pkg: offering?.monthly, cycle: 'monthly' },
  ];
  for (const { pkg, cycle } of plans) {
    const period = freeTrialPeriod(pkg?.product, eligibility, eligibleStatus);
    if (period) return { ...period, cycle };
  }
  return null;
}

/**
 * Whether any of the app's own signals say the account already pays, so it
 * mustn't be offered an App Store trial: RevenueCat's Gold or Lifetime, the
 * tier the app keeps (userTier), or the account's profile row, which is where
 * a web (Stripe) plan shows. On the profile, a gold or lifetime
 * subscription_tier counts, and so does a Stripe customer id. The id is there
 * because the app's own RevenueCat sync can write free over a web member's
 * subscription_tier at launch, while nothing in the app writes the id. The API
 * sets it when a web checkout starts, so it also catches a checkout that was
 * started and never finished. profile is null for a guest.
 *
 * The id stays on the profile after a web plan ends or a checkout is dropped,
 * so it can't tell a web member from someone who no longer pays. webPlan is
 * the API's answer from GET /v1/stripe/my-plan (src/utils/webPlan.js): 'gold'
 * or 'lifetime' counts as paid, null means Stripe holds no plan and the id
 * stops counting, and undefined (not asked yet, or an answer that couldn't
 * tell) keeps counting it.
 */
export function alreadyPaid({ revenueCatGold, lifetime, userTier, profile, webPlan }) {
  if (revenueCatGold || lifetime) return true;
  if (userTier === 'gold' || userTier === 'lifetime') return true;
  if (webPlan === 'gold' || webPlan === 'lifetime') return true;
  const tier = profile?.subscription_tier;
  if (tier === 'gold' || tier === 'lifetime') return true;
  // Stripe's own answer that it holds no plan beats the leftover id.
  return webPlan === null ? false : Boolean(profile?.stripe_customer_id);
}

/**
 * What upgrade prompts may do for the account: 'paid' when alreadyPaid says
 * it already pays, 'unknown' while a signed-in account's profile hasn't been
 * read (or couldn't be), and 'free' otherwise. A guest has no profile to wait
 * for. Only a 'free' account is promised the free trial (upsellTrial), since
 * an App Store trial started by someone already paying on the web is billed by
 * Apple on top of Stripe.
 */
export function upsellPlan({ revenueCatGold, lifetime, userTier, signedIn, profileRead, profile, webPlan }) {
  const known = !signedIn || profileRead;
  if (alreadyPaid({ revenueCatGold, lifetime, userTier, profile: signedIn && known ? profile : null, webPlan: signedIn ? webPlan : undefined })) return 'paid';
  return known ? 'free' : 'unknown';
}

/** The trial an upgrade prompt may promise: only to a 'free' account. */
export function upsellTrial(plan, trial) {
  return plan === 'free' && trial ? trial : null;
}

/** An upgrade banner's line: the free trial when there is one, Gold plainly when not. */
export function unlockLine(feature, trial) {
  return trial ? `Unlock ${feature}, free for ${trialLabel(trial)}` : `Unlock ${feature} with Gold`;
}

/**
 * What a free account sees under Historical Spot Prices, where Gold's charts
 * go: a line saying the charts come with Gold, and a button worded like the
 * banners, offering the free trial only when there is one.
 */
export function priceHistoryPrompt(trial) {
  return {
    line: 'Price history charts for gold, silver, platinum and palladium come with Gold.',
    action: unlockLine('price history', trial),
  };
}

/** How the Gold and Benefits screens describe Troy. */
export const TROY_GOLD_LINE = `Up to ${TROY_GOLD_DAILY_QUESTIONS} questions to Troy a day`;

/**
 * What a failed Listen request means, from /v1/troy/speak's status and body:
 * 'gold' when the account isn't on Gold (403), 'limit' when the day's voice
 * cap is used up (429 Voice limit reached), and 'error' for anything else,
 * including the per-minute rate limit's 429.
 */
export function speakFailure(status, body) {
  if (status === 403) return 'gold';
  if (status === 429 && body?.error === 'Voice limit reached') return 'limit';
  return 'error';
}

/** What a free account sees after tapping Listen. */
export function listenGoldPrompt(trial) {
  const base = `Hearing Troy's answers out loud comes with Gold. It includes ${TROY_GOLD_DAILY_VOICE} voice uses a day, spoken questions and answers together.`;
  return {
    title: 'Listen with Gold',
    message: trial ? `${base} You can try Gold free for ${trialLabel(trial)}.` : base,
    action: trial ? 'Try Gold free' : 'See Gold',
  };
}

/**
 * What a Listen the server refused for Gold (a 403) shows, by upsellPlan:
 * the Gold prompt to a 'free' account, and to one that pays or can't be
 * checked yet a plain note with no pitch, since the server may not have caught
 * up with a plan the app can see. An answer that played by itself after a
 * spoken question pitches nothing, and a free account hears nothing about it.
 * null means show nothing.
 */
export function listenRefusedPrompt(plan, trial, { auto = false } = {}) {
  const unavailable = {
    title: 'Voice Unavailable',
    message: "Hearing Troy's answers out loud comes with Gold. If you already have Gold, it can take a few minutes to show up here.",
    action: null,
  };
  if (plan === 'paid') return unavailable;
  if (auto) return null;
  return plan === 'free' ? listenGoldPrompt(trial) : unavailable;
}

/**
 * What a Gold account sees once the day's voice uses run out. limit is the
 * 429's own limit from the server when it sent one.
 */
export function listenLimitPrompt(limit) {
  const uses = Number.isInteger(limit) && limit > 0 ? limit : TROY_GOLD_DAILY_VOICE;
  return {
    title: 'Voice limit reached',
    message: `You've used today's ${uses} voice uses, spoken questions and answers together. They reset at midnight Eastern time.`,
  };
}
