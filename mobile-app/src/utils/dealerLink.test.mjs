// Run with: node --test mobile-app/src/utils/dealerLink.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { isWebUrl, openDealerLink } from './dealerLink.js';

test('http and https links are web links', () => {
  assert.equal(isWebUrl('https://www.awin1.com/cread.php?awinmid=88985'), true);
  assert.equal(isWebUrl('http://sdbullion.com'), true);
  assert.equal(isWebUrl('HTTPS://APMEX.COM/'), true);
});

test('anything else is not', () => {
  for (const url of [undefined, null, '', 42, 'javascript:alert(1)', 'tel:5551234', 'mailto:a@b.co', 'https://', 'https:///path', 'apmex.com', 'https://a b.com']) {
    assert.equal(isWebUrl(url), false, String(url));
  }
});

test('a web link opens and nothing is shown', async () => {
  const opened = [];
  let failed = 0;
  const ok = await openDealerLink('https://apmex.com', async (u) => { opened.push(u); }, () => { failed += 1; });
  assert.equal(ok, true);
  assert.deepEqual(opened, ['https://apmex.com']);
  assert.equal(failed, 0);
});

test('a rejected open tells the user once and never rejects', async () => {
  let failed = 0;
  const ok = await openDealerLink('https://apmex.com', () => Promise.reject(new Error('no browser')), () => { failed += 1; });
  assert.equal(ok, false);
  assert.equal(failed, 1);
});

test('an open that throws is caught the same way', async () => {
  let failed = 0;
  const ok = await openDealerLink('https://apmex.com', () => { throw new Error('boom'); }, () => { failed += 1; });
  assert.equal(ok, false);
  assert.equal(failed, 1);
});

test('a link from the API that is not http(s) is never opened', async () => {
  let opened = 0;
  let failed = 0;
  const ok = await openDealerLink('javascript:alert(1)', () => { opened += 1; }, () => { failed += 1; });
  assert.equal(ok, false);
  assert.equal(opened, 0);
  assert.equal(failed, 1);
});

test('surrounding spaces are trimmed before opening', async () => {
  const opened = [];
  await openDealerLink('  https://apmex.com  ', async (u) => { opened.push(u); }, () => {});
  assert.deepEqual(opened, ['https://apmex.com']);
});
