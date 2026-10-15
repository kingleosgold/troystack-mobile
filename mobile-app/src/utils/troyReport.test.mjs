import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTroyReport, reportEmailUrl, reportText, reportContent, REPORT_CONTENT_MAX, SUPPORT_EMAIL } from './troyReport.js';

const message = { id: 'msg-1', role: 'assistant', content: 'Silver is up 2% today.' };
const MSG_ID = '3f1c2b4a-9d8e-4f7a-b6c5-1a2b3c4d5e6f';
const USER_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const CONV_ID = '9e8d7c6b-5a4f-4e3d-a2c1-b0a9f8e7d6c5';

function recorder(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { calls, fetchImpl };
}

test('a 2xx answer counts as sent, with the reply, reason and ids in the body', async () => {
  const { calls, fetchImpl } = recorder({ ok: true, status: 201 });
  const result = await sendTroyReport({
    apiBase: 'https://api.example', token: 'tok', userId: USER_ID, conversationId: CONV_ID,
    message: { ...message, id: MSG_ID }, reason: 'offensive', fetchImpl,
  });
  assert.equal(result, 'sent');
  assert.equal(calls[0].url, 'https://api.example/v1/troy/report');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    userId: USER_ID, conversationId: CONV_ID, messageId: MSG_ID, reason: 'offensive', content: message.content,
  });
});

test('ids the API would refuse, like a daily brief\'s, go as null so the report still lands', async () => {
  const { calls, fetchImpl } = recorder({ ok: true, status: 201 });
  await sendTroyReport({
    apiBase: 'https://api.example', userId: USER_ID, conversationId: 'temp-1',
    message: { id: 'brief-1712', content: 'Today in metals.' }, reason: 'wrong', fetchImpl,
  });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messageId, null);
  assert.equal(body.conversationId, null);
  assert.equal(body.userId, USER_ID);
});

test('a guest report goes without a token', async () => {
  const { calls, fetchImpl } = recorder({ ok: true, status: 200 });
  await sendTroyReport({ apiBase: 'https://api.example', message, reason: 'wrong', fetchImpl });
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(JSON.parse(calls[0].init.body).userId, null);
});

test('a 404 before the route is live, a 500 or no connection reads as unavailable', async () => {
  for (const answer of [{ ok: false, status: 404 }, { ok: false, status: 500 }, new Error('offline')]) {
    const { fetchImpl } = recorder(answer);
    assert.equal(await sendTroyReport({ apiBase: 'https://api.example', message, reason: 'wrong', fetchImpl }), 'unavailable');
  }
});

test('a slow route times out as unavailable', async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const result = await sendTroyReport({ apiBase: 'https://api.example', message, reason: 'wrong', fetchImpl, timeoutMs: 20 });
  assert.equal(result, 'unavailable');
});

test('a long reply is cut to the cap in the body and the email', async () => {
  const long = { id: 'm', content: 'x'.repeat(REPORT_CONTENT_MAX + 50) };
  const { calls, fetchImpl } = recorder({ ok: true, status: 200 });
  await sendTroyReport({ apiBase: 'https://api.example', message: long, reason: 'wrong', fetchImpl });
  assert.equal(JSON.parse(calls[0].init.body).content.length, REPORT_CONTENT_MAX);
  const body = decodeURIComponent(reportEmailUrl({ message: long, reason: 'wrong' }).split('&body=')[1]);
  assert.equal(body.split('\n').pop().length, REPORT_CONTENT_MAX);
});

test('the email goes to support with the reason label, ids and reply', () => {
  const url = reportEmailUrl({ message, reason: 'offensive', conversationId: 'c1' });
  assert.ok(url.startsWith(`mailto:${SUPPORT_EMAIL}?subject=Report%20a%20Troy%20reply&body=`));
  const body = decodeURIComponent(url.split('&body=')[1]);
  assert.equal(body, 'Reason: Offensive or harmful\nMessage: msg-1\nConversation: c1\n\nSilver is up 2% today.');
});

test('the copied report matches the email body', () => {
  const report = { message, reason: 'wrong', conversationId: 'c1' };
  assert.equal(reportText(report), 'Reason: Wrong or misleading\nMessage: msg-1\nConversation: c1\n\nSilver is up 2% today.');
  assert.equal(decodeURIComponent(reportEmailUrl(report).split('&body=')[1]), reportText(report));
});

test('a cut through an emoji drops the half character, so the email link can be built', () => {
  const content = 'x'.repeat(REPORT_CONTENT_MAX - 1) + '\u{1F947}';
  const cut = reportContent(content);
  assert.equal(cut.length, REPORT_CONTENT_MAX - 1);
  assert.doesNotThrow(() => reportEmailUrl({ message: { id: 'm', content }, reason: 'wrong' }));
  assert.equal(reportContent('ok \u{1F947}'), 'ok \u{1F947}');
});
