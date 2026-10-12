// Run with: node --test mobile-app/src/utils/goldOffer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_ELIGIBLE,
  PROFILE_REREAD_MS,
  alreadyPaid,
  listenRefusedPrompt,
  shouldRereadProfile,
  upsellPlan,
  upsellTrial,
  TROY_GOLD_DAILY_QUESTIONS,
  TROY_GOLD_DAILY_VOICE,
  TROY_GOLD_LINE,
  freeTrialPeriod,
  listenGoldPrompt,
  listenLimitPrompt,
  offeringFreeTrial,
  priceHistoryPrompt,
  speakFailure,
  trialLabel,
  unlockLine,
} from './goldOffer.js';

const INELIGIBLE = 1;
const UNKNOWN = 0;

function product(id, introPrice) {
  return { identifier: id, introPrice };
}
const sevenDayTrial = { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 };
const oneWeekTrial = { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 };
const oneMonthTrial = { price: 0, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 };
const paidIntro = { price: 0.99, periodUnit: 'MONTH', periodNumberOfUnits: 1, cycles: 1 };

test('a trial counts only when this Apple ID is eligible for it', () => {
  const yearly = product('gold_yearly', sevenDayTrial);
  assert.deepEqual(freeTrialPeriod(yearly, { gold_yearly: { status: INTRO_ELIGIBLE } }), { count: 7, unit: 'day' });
  assert.equal(freeTrialPeriod(yearly, { gold_yearly: { status: INELIGIBLE } }), null, 'trial already used');
  assert.equal(freeTrialPeriod(yearly, { gold_yearly: { status: UNKNOWN } }), null, 'unknown reads as no trial');
  assert.equal(freeTrialPeriod(yearly, {}), null, 'no eligibility answer reads as no trial');
  assert.equal(freeTrialPeriod(product('gold_yearly', null), { gold_yearly: { status: INTRO_ELIGIBLE } }), null, 'no intro offer');
  assert.equal(freeTrialPeriod(product('gold_yearly', paidIntro), { gold_yearly: { status: INTRO_ELIGIBLE } }), null, 'a paid intro price is not a free trial');
});

test('trial lengths read the way the Gold screen has always shown them', () => {
  const eligible = (id) => ({ [id]: { status: INTRO_ELIGIBLE } });
  assert.equal(trialLabel(freeTrialPeriod(product('a', sevenDayTrial), eligible('a')), { capitalized: true }), '7 Days');
  assert.equal(trialLabel(freeTrialPeriod(product('a', oneWeekTrial), eligible('a')), { capitalized: true }), '7 Days');
  assert.equal(trialLabel(freeTrialPeriod(product('a', oneMonthTrial), eligible('a')), { capitalized: true }), '1 Month');
  assert.equal(trialLabel({ count: 1, unit: 'day' }, { capitalized: true }), '1 Day');
  assert.equal(trialLabel({ count: 2, unit: 'month' }, { capitalized: true }), '2 Months');
  assert.equal(trialLabel({ count: 7, unit: 'day' }), '7 days');
  assert.equal(trialLabel(null), null);
});

test('a prompt offers the yearly trial first, then the monthly one, and names the plan it is on', () => {
  const offering = {
    annual: { product: product('gold_yearly', sevenDayTrial) },
    monthly: { product: product('gold_monthly', oneMonthTrial) },
  };
  assert.deepEqual(
    offeringFreeTrial(offering, { gold_yearly: { status: INTRO_ELIGIBLE }, gold_monthly: { status: INTRO_ELIGIBLE } }),
    { count: 7, unit: 'day', cycle: 'yearly' },
  );
  assert.deepEqual(
    offeringFreeTrial(offering, { gold_yearly: { status: INELIGIBLE }, gold_monthly: { status: INTRO_ELIGIBLE } }),
    { count: 1, unit: 'month', cycle: 'monthly' },
  );
  assert.equal(offeringFreeTrial(offering, { gold_yearly: { status: INELIGIBLE }, gold_monthly: { status: INELIGIBLE } }), null);
  assert.equal(offeringFreeTrial(null, {}), null);
});

test('a free week promised from the monthly plan opens the Gold screen on monthly', () => {
  // Codex's case: the yearly trial was used, the monthly one wasn't. The promise
  // has to carry the plan, since the Gold screen otherwise opens on yearly,
  // where the button buys the yearly plan with no trial.
  const offering = {
    annual: { product: product('gold_yearly', sevenDayTrial) },
    monthly: { product: product('gold_monthly', sevenDayTrial) },
  };
  const trial = offeringFreeTrial(offering, { gold_yearly: { status: INELIGIBLE }, gold_monthly: { status: INTRO_ELIGIBLE } });
  assert.equal(trial.cycle, 'monthly');
  assert.equal(unlockLine('full insights', trial), 'Unlock full insights, free for 7 days');
  assert.equal(listenGoldPrompt(trial).action, 'Try Gold free');
});

test('banners promise a free start only with a trial to give', () => {
  assert.equal(unlockLine('full insights', { count: 7, unit: 'day' }), 'Unlock full insights, free for 7 days');
  assert.equal(unlockLine('advanced analytics', null), 'Unlock advanced analytics with Gold');
  assert.doesNotMatch(unlockLine('full insights', null), /free/i);
});

test('free accounts are told price history comes with Gold, with the trial only when there is one', () => {
  const withTrial = priceHistoryPrompt({ count: 7, unit: 'day', cycle: 'yearly' });
  assert.equal(withTrial.line, 'Price history charts for gold, silver, platinum and palladium come with Gold.');
  assert.equal(withTrial.action, 'Unlock price history, free for 7 days');
  const without = priceHistoryPrompt(null);
  assert.equal(without.line, withTrial.line);
  assert.equal(without.action, 'Unlock price history with Gold');
  assert.doesNotMatch(without.action, /free/i);
});

test("Troy's line says what the server allows", () => {
  // troystack-api src/routes/troy-chat.js: GOLD_DAILY_LIMIT = 30, and a Gold voice
  // limit of 20 a day that /speak and /transcribe count together.
  assert.equal(TROY_GOLD_DAILY_QUESTIONS, 30);
  assert.equal(TROY_GOLD_DAILY_VOICE, 20);
  assert.equal(TROY_GOLD_LINE, 'Up to 30 questions to Troy a day');
  assert.doesNotMatch(TROY_GOLD_LINE, /unlimited/i);
});

test('Listen failures: 403 asks for Gold, the voice cap says used up, everything else stays an error', () => {
  assert.equal(speakFailure(403, { error: 'TTS requires Gold subscription' }), 'gold');
  assert.equal(speakFailure(429, { error: 'Voice limit reached', message: 'Daily voice limit reached (20/day).', limit: 20 }), 'limit');
  assert.equal(speakFailure(429, { error: 'Too many requests, please try again later.' }), 'error', 'the per-minute rate limit is not the daily cap');
  assert.equal(speakFailure(429, {}), 'error');
  assert.equal(speakFailure(400, { error: 'Valid userId required' }), 'error');
  assert.equal(speakFailure(500, { error: 'TTS generation failed' }), 'error');
});

test('the Listen prompt offers the trial only when there is one', () => {
  const withTrial = listenGoldPrompt({ count: 7, unit: 'day' });
  assert.match(withTrial.message, /try Gold free for 7 days/);
  assert.equal(withTrial.action, 'Try Gold free');
  const without = listenGoldPrompt(null);
  assert.doesNotMatch(without.message, /free/i);
  assert.equal(without.action, 'See Gold');
  assert.match(without.message, /20 voice uses a day, spoken questions and answers together/);
});

test('the voice limit message counts questions and answers and says when it resets', () => {
  const prompt = listenLimitPrompt(20);
  assert.equal(prompt.title, 'Voice limit reached');
  assert.equal(prompt.message, "You've used today's 20 voice uses, spoken questions and answers together. They reset at midnight Eastern time.");
  assert.match(listenLimitPrompt(25).message, /today's 25 voice uses/, "the server's own limit wins");
  assert.match(listenLimitPrompt(undefined).message, /today's 20 voice uses/, 'without one, the known Gold limit');
  assert.match(listenLimitPrompt('20').message, /today's 20 voice uses/);
});

test('no long dashes in anything a person reads', () => {
  const strings = [
    TROY_GOLD_LINE,
    unlockLine('full insights', { count: 7, unit: 'day' }),
    unlockLine('full insights', null),
    ...Object.values(listenGoldPrompt({ count: 7, unit: 'day' })),
    ...Object.values(listenGoldPrompt(null)),
    ...Object.values(listenLimitPrompt(20)),
    ...Object.values(priceHistoryPrompt({ count: 7, unit: 'day' })),
    ...Object.values(priceHistoryPrompt(null)),
  ];
  for (const s of strings) assert.doesNotMatch(s, /[\u2013\u2014]/, s);
});

test("any of the app's own signals makes the account paid", () => {
  const free = { revenueCatGold: false, lifetime: false, userTier: 'free', profile: { subscription_tier: 'free', stripe_customer_id: null } };
  assert.equal(alreadyPaid(free), false);
  assert.equal(alreadyPaid({ ...free, revenueCatGold: true }), true, 'App Store Gold');
  assert.equal(alreadyPaid({ ...free, lifetime: true }), true, 'Lifetime from RevenueCat');
  assert.equal(alreadyPaid({ ...free, userTier: 'gold' }), true);
  assert.equal(alreadyPaid({ ...free, userTier: 'lifetime' }), true);
  assert.equal(alreadyPaid({ ...free, profile: { subscription_tier: 'gold' } }), true, 'a web plan on the profile');
  assert.equal(alreadyPaid({ ...free, profile: { subscription_tier: 'lifetime' } }), true);
  assert.equal(
    alreadyPaid({ ...free, profile: { subscription_tier: 'free', stripe_customer_id: 'cus_123' } }),
    true,
    "a web member whose tier the app's own launch sync wrote free over",
  );
  assert.equal(alreadyPaid({ ...free, profile: null }), false, 'no profile, a guest');
  assert.equal(alreadyPaid({ ...free, profile: {} }), false, 'an account with no plan on its profile');
});

test('upgrade prompts know whether the account pays, and wait for its profile before they can tell', () => {
  const base = { revenueCatGold: false, lifetime: false, userTier: 'free', signedIn: true, profileRead: true, profile: { subscription_tier: 'free' } };
  assert.equal(upsellPlan(base), 'free');
  assert.equal(upsellPlan({ ...base, revenueCatGold: true }), 'paid');
  assert.equal(upsellPlan({ ...base, profile: { subscription_tier: 'free', stripe_customer_id: 'cus_9' } }), 'paid', 'a web member');
  assert.equal(upsellPlan({ ...base, profileRead: false, profile: null }), 'unknown', 'profile not read yet');
  assert.equal(upsellPlan({ ...base, profileRead: false, profile: null, revenueCatGold: true }), 'paid', 'RevenueCat alone can say paid');
  assert.equal(upsellPlan({ ...base, signedIn: false, profileRead: false, profile: null }), 'free', 'a guest has no profile to wait for');
});

test('only a free account is promised the trial', () => {
  const trial = { count: 7, unit: 'day', cycle: 'yearly' };
  assert.equal(upsellTrial('free', trial), trial);
  assert.equal(upsellTrial('paid', trial), null);
  assert.equal(upsellTrial('unknown', trial), null);
  assert.equal(upsellTrial('free', null), null);
  // The banners then read plainly.
  assert.equal(unlockLine('full insights', upsellTrial('paid', trial)), 'Unlock full insights with Gold');
  assert.equal(unlockLine('full insights', upsellTrial('free', trial)), 'Unlock full insights, free for 7 days');
});

test("a refused Listen pitches Gold only to a free account, and never to one that pays or can't be checked", () => {
  const trial = { count: 7, unit: 'day', cycle: 'yearly' };
  const free = listenRefusedPrompt('free', trial, { auto: false });
  assert.equal(free.title, 'Listen with Gold');
  assert.equal(free.action, 'Try Gold free');
  const paid = listenRefusedPrompt('paid', trial, { auto: false });
  assert.deepEqual(paid, {
    title: 'Voice Unavailable',
    message: "Troy's voice comes with Gold, and Gold isn't showing on this account. If you just bought a plan, give it a few minutes and try again.",
    action: null,
  });
  // The same note goes to a plan the server hasn't caught up with and to a web
  // plan that ended, so it can't promise that trying again will work.
  assert.doesNotMatch(paid.message, /right now|Try again later/);
  assert.deepEqual(listenRefusedPrompt('paid', trial, { auto: true }), paid, 'a paying customer hears why even when it played by itself');
  assert.deepEqual(listenRefusedPrompt('unknown', trial, { auto: false }), paid);
  assert.equal(listenRefusedPrompt('unknown', trial, { auto: true }), null);
  assert.equal(listenRefusedPrompt('free', trial, { auto: true }), null, 'no pitch for an answer that played by itself');
  for (const p of [free, paid]) {
    for (const v of Object.values(p)) if (typeof v === 'string') assert.doesNotMatch(v, new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`), v);
  }
});

test("the web plan check decides what a Stripe customer id means once the app has it", () => {
  const lapsed = { revenueCatGold: false, lifetime: false, userTier: 'free', profile: { subscription_tier: 'free', stripe_customer_id: 'cus_123' } };
  assert.equal(alreadyPaid(lapsed), true, 'before any check the id still counts');
  assert.equal(alreadyPaid({ ...lapsed, webPlan: undefined }), true, "a check that couldn't tell keeps counting it");
  assert.equal(alreadyPaid({ ...lapsed, webPlan: null }), false, 'Stripe holds no plan, so the id stops counting');
  assert.equal(alreadyPaid({ ...lapsed, webPlan: 'gold' }), true);
  assert.equal(alreadyPaid({ ...lapsed, profile: {}, webPlan: 'lifetime' }), true, 'a web Lifetime counts with nothing on the profile');
  assert.equal(
    alreadyPaid({ ...lapsed, profile: { subscription_tier: 'gold', stripe_customer_id: 'cus_123' }, webPlan: null }),
    true,
    'a gold tier on the profile still counts, since an App Store plan writes it too',
  );
  assert.equal(alreadyPaid({ ...lapsed, revenueCatGold: true, webPlan: null }), true, 'App Store Gold still counts');

  const base = { revenueCatGold: false, lifetime: false, userTier: 'free', signedIn: true, profileRead: true, profile: lapsed.profile };
  assert.equal(upsellPlan(base), 'paid');
  assert.equal(upsellPlan({ ...base, webPlan: null }), 'free', 'a lapsed web customer can be offered the trial');
  assert.equal(upsellPlan({ ...base, profileRead: false, profile: null, webPlan: 'gold' }), 'paid', 'the web plan alone can say paid');
  assert.equal(upsellPlan({ ...base, profileRead: false, profile: null, webPlan: null }), 'unknown', 'still waiting on the profile');
  assert.equal(upsellPlan({ ...base, signedIn: false, profileRead: false, profile: null, webPlan: 'gold' }), 'free', 'a guest has no web plan');
});

test('the profile is read at sign-in and again at most once a minute', () => {
  assert.equal(PROFILE_REREAD_MS, 60 * 1000);
  const now = 1_000_000_000;
  assert.equal(shouldRereadProfile({ now, lastReadAt: 0 }), true, 'the first read always goes');
  assert.equal(shouldRereadProfile({ now, lastReadAt: now - 30 * 1000 }), false, 'thirty seconds after the last read');
  assert.equal(shouldRereadProfile({ now, lastReadAt: now - PROFILE_REREAD_MS }), true, 'a minute after');
  assert.equal(shouldRereadProfile({ now, lastReadAt: now - 10 * 60 * 1000 }), true);
});
