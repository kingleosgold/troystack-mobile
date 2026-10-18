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

test('troyResetLabel counts tomorrow on the calendar across the clock change', () => {
  // 12:30 AM EDT on November 1, 2026, the night the clocks fall back.
  const now = new Date('2026-11-01T04:30:00Z');
  assert.equal(troyResetLabel('2026-11-02T14:00:00Z', now), 'tomorrow at 9:00 AM ET');
  assert.equal(troyResetLabel('2026-12-31T14:00:00Z', new Date('2026-12-30T15:00:00Z')), 'tomorrow at 9:00 AM ET');
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

test('answeredTurns keeps only answered questions, newest six turns', async () => {
  const { answeredTurns } = await import('./troyChat.js');
  const msgs = [
    { role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'lost' },
    { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'q4' }, { role: 'assistant', content: 'a4' },
    { role: 'user', content: 'pending' },
  ];
  assert.deepEqual(answeredTurns(msgs), [
    { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' },
    { role: 'user', content: 'q4' }, { role: 'assistant', content: 'a4' },
  ]);
  assert.deepEqual(answeredTurns([]), []);
  assert.deepEqual(answeredTurns(null), []);
});

test('readGuestAsk tells a reply, the limit, a missing route and an error apart', async () => {
  const { readGuestAsk } = await import('./troyChat.js');
  const quota = { questionsUsed: 1, questionsLimit: 3, resetsAt: '2026-10-19T14:00:00.000Z' };
  assert.deepEqual(readGuestAsk(200, { reply: 'Gold is up.', ...quota }), { kind: 'reply', reply: 'Gold is up.', quota });
  assert.deepEqual(readGuestAsk(429, { error: 'Visitor question limit reached', ...quota, questionsUsed: 3 }), { kind: 'limit', quota: { ...quota, questionsUsed: 3 } });
  // The general rate limiter's 429 has no quota, and passes in a minute.
  assert.deepEqual(readGuestAsk(429, { error: 'Too many requests' }), { kind: 'error', error: 'Too many requests' });
  assert.deepEqual(readGuestAsk(404, null), { kind: 'unavailable' });
  assert.deepEqual(readGuestAsk(200, { reply: '  ' }), { kind: 'error', error: null });
  assert.deepEqual(readGuestAsk(503, { error: 'Troy is unavailable right now' }), { kind: 'error', error: 'Troy is unavailable right now' });
});

test('guestQuestionsLine says what is left the way troystack.ai does', async () => {
  const { guestQuestionsLine, guestQuestionsLeft } = await import('./troyChat.js');
  assert.equal(guestQuestionsLine({ questionsUsed: 1, questionsLimit: 3 }), '2 of 3 free questions left today');
  assert.equal(guestQuestionsLine({ questionsUsed: 5, questionsLimit: 3 }), '0 of 3 free questions left today');
  assert.equal(guestQuestionsLine(null), null);
  assert.equal(guestQuestionsLeft({ questionsUsed: 0, questionsLimit: 0 }), null);
});

test('guestLimitPrompt points a guest to a free account in the webapp words', async () => {
  const { guestLimitPrompt } = await import('./troyChat.js');
  const now = new Date('2026-10-18T14:00:00Z');
  const p = guestLimitPrompt({ questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-19T13:05:00Z' }, now);
  assert.equal(p.title, "Today's questions are used");
  assert.equal(p.message, "That's today's 3 free questions. They come back tomorrow at 9:05 AM ET. A free account gets you three more a day, with your stack in context.");
  assert.equal(p.action, 'Create a free account');
  assert.match(guestLimitPrompt(null, now).message, /^That's today's free questions\. They come back tomorrow\./);
});

test('guestQuestionsLeft forgets a count once its reset time has passed', async () => {
  const { guestQuestionsLeft, guestQuestionsLine } = await import('./troyChat.js');
  const quota = { questionsUsed: 3, questionsLimit: 3, resetsAt: '2026-10-19T13:05:00Z' };
  assert.equal(guestQuestionsLeft(quota, new Date('2026-10-19T13:00:00Z')), 0);
  assert.equal(guestQuestionsLeft(quota, new Date('2026-10-19T13:05:00Z')), null);
  assert.equal(guestQuestionsLine(quota, new Date('2026-10-19T14:00:00Z')), null);
});
