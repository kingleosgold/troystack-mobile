// Run with: node --test mobile-app/src/utils/goldOffer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_ELIGIBLE,
  TROY_GOLD_DAILY_QUESTIONS,
  TROY_GOLD_DAILY_VOICE,
  TROY_GOLD_LINE,
  freeTrialPeriod,
  listenGoldPrompt,
  listenLimitPrompt,
  offeringFreeTrial,
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
  ];
  for (const s of strings) assert.doesNotMatch(s, /[\u2013\u2014]/, s);
});
