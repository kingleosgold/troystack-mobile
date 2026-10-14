import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTroyReport, reportEmailUrl, reportText, REPORT_CONTENT_MAX, SUPPORT_EMAIL } from './troyReport.js';

const message = { id: 'msg-1', role: 'assistant', content: 'Silver is up 2% today.' };

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
    apiBase: 'https://api.example', token: 'tok', userId: 'u1', conversationId: 'c1',
    message, reason: 'offensive', fetchImpl,
  });
  assert.equal(result, 'sent');
  assert.equal(calls[0].url, 'https://api.example/v1/troy/report');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    userId: 'u1', conversationId: 'c1', messageId: 'msg-1', reason: 'offensive', content: message.content,
  });
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
