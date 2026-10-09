// Run with: node --test mobile-app/src/utils/goldOffer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTRO_ELIGIBLE,
  LISTEN_LIMIT_PROMPT,
  TROY_GOLD_DAILY_QUESTIONS,
  TROY_GOLD_DAILY_VOICE,
  TROY_GOLD_LINE,
  freeTrialPeriod,
  listenGoldPrompt,
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

test('a prompt offers the yearly trial first, then the monthly one, else none', () => {
  const offering = {
    annual: { product: product('gold_yearly', sevenDayTrial) },
    monthly: { product: product('gold_monthly', oneMonthTrial) },
  };
  assert.deepEqual(
    offeringFreeTrial(offering, { gold_yearly: { status: INTRO_ELIGIBLE }, gold_monthly: { status: INTRO_ELIGIBLE } }),
    { count: 7, unit: 'day' },
  );
  assert.deepEqual(
    offeringFreeTrial(offering, { gold_yearly: { status: INELIGIBLE }, gold_monthly: { status: INTRO_ELIGIBLE } }),
    { count: 1, unit: 'month' },
  );
  assert.equal(offeringFreeTrial(offering, { gold_yearly: { status: INELIGIBLE }, gold_monthly: { status: INELIGIBLE } }), null);
  assert.equal(offeringFreeTrial(null, {}), null);
});

test('banners promise a free start only with a trial to give', () => {
  assert.equal(unlockLine('full insights', { count: 7, unit: 'day' }), 'Unlock full insights, free for 7 days');
  assert.equal(unlockLine('advanced analytics', null), 'Unlock advanced analytics with Gold');
  assert.doesNotMatch(unlockLine('full insights', null), /free/i);
});

test("Troy's line says what the server allows", () => {
  // troystack-api src/routes/troy-chat.js: GOLD_DAILY_LIMIT = 30, voice cap 20 a day.
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
  assert.match(without.message, /up to 20 a day/);
});

test('no long dashes in anything a person reads', () => {
  const strings = [
    TROY_GOLD_LINE,
    unlockLine('full insights', { count: 7, unit: 'day' }),
    unlockLine('full insights', null),
    ...Object.values(listenGoldPrompt({ count: 7, unit: 'day' })),
    ...Object.values(listenGoldPrompt(null)),
    LISTEN_LIMIT_PROMPT.title,
    LISTEN_LIMIT_PROMPT.message,
  ];
  for (const s of strings) assert.doesNotMatch(s, /[\u2013\u2014]/, s);
});
