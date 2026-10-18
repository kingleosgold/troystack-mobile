// Run with: node --test mobile-app/src/utils/troyChat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { plainDashes, isQuotaRefusal, troyResetLabel, troyLimitPrompt } from './troyChat.js';

test('plainDashes turns long dashes into the house style, like the webapp', () => {
  assert.equal(plainDashes('Gold held — silver ran.'), 'Gold held, silver ran.');
  assert.equal(plainDashes('Up 3–5% this week'), 'Up 3-5% this week');
  assert.equal(plainDashes('— Troy'), 'Troy');
  assert.equal(plainDashes('Worth it —.'), 'Worth it.');
  assert.equal(plainDashes('a — b — c'), 'a, b, c');
  assert.equal(plainDashes('**Bold** stays'), '**Bold** stays');
  assert.equal(plainDashes(''), '');
  assert.equal(plainDashes(null), '');
});

test('isQuotaRefusal reads the API quota body only', () => {
  assert.equal(isQuotaRefusal({ error: 'Daily question limit reached', questionsUsed: 3, questionsLimit: 3, resetsAt: 'x' }), true);
  assert.equal(isQuotaRefusal({ error: 'Something else' }), false);
  assert.equal(isQuotaRefusal({ message: { content: 'hi' } }), false);
  assert.equal(isQuotaRefusal(null), false);
});

test('troyResetLabel says when the questions come back in New York time', () => {
  const now = new Date('2026-10-18T14:00:00Z'); // 10 AM ET
  assert.equal(troyResetLabel('2026-10-18T22:30:00Z', now), 'at 6:30 PM ET');
  assert.equal(troyResetLabel('2026-10-19T13:05:00Z', now), 'tomorrow at 9:05 AM ET');
  assert.equal(troyResetLabel('2026-10-21T13:05:00Z', now), 'Wednesday at 9:05 AM ET');
  assert.equal(troyResetLabel(undefined, now), 'tomorrow');
  assert.equal(troyResetLabel('nope', now), 'tomorrow');
});

test('troyLimitPrompt pitches Gold to a free account and the trial only when there is one', () => {
  const now = new Date('2026-10-18T14:00:00Z');
  const quota = { questionsLimit: 3, resetsAt: '2026-10-19T13:05:00Z' };
  const withTrial = troyLimitPrompt({ quota, plan: 'free', trial: { count: 7, unit: 'day', cycle: 'yearly' }, now });
  assert.equal(withTrial.message, "That's today's 3 free questions. They come back tomorrow at 9:05 AM ET. Gold gives you 30 a day, and you can try it free for 7 days.");
  assert.equal(withTrial.action, 'Try Gold free');
  const noTrial = troyLimitPrompt({ quota, plan: 'free', trial: null, now });
  assert.equal(noTrial.message, "That's today's 3 free questions. They come back tomorrow at 9:05 AM ET. Gold gives you 30 a day.");
  assert.equal(noTrial.action, 'See Gold');
});

test('troyLimitPrompt never pitches an account that pays or cannot be checked', () => {
  const now = new Date('2026-10-18T14:00:00Z');
  for (const plan of ['paid', 'unknown']) {
    const p = troyLimitPrompt({ quota: { questionsLimit: 30, resetsAt: '2026-10-18T22:30:00Z' }, plan, trial: null, now });
    assert.equal(p.message, "That's today's 30 questions to Troy. They come back at 6:30 PM ET.");
    assert.equal(p.action, null);
  }
});

test("troyLimitPrompt on the phone's own count says tomorrow", () => {
  const p = troyLimitPrompt({ quota: { questionsLimit: 3 }, plan: 'free', trial: null });
  assert.match(p.message, /^That's today's 3 free questions\. They come back tomorrow\./);
});
