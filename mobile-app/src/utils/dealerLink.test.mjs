// Run with: node --test mobile-app/src/utils/dealerLink.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('an opener that reads this works when passed the way App.js passes it', async () => {
  // Linking.openURL calls this._validateURL, so passed bare it throws.
  const Linking = { calls: [], _validateURL() {}, openURL(u) { this._validateURL(u); this.calls.push(u); return Promise.resolve(); } };
  const bare = await openDealerLink('https://apmex.com', Linking.openURL, () => {});
  assert.equal(bare, false);
  const openInBrowser = (u) => Linking.openURL(u);
  let failed = 0;
  const ok = await openDealerLink('https://apmex.com', openInBrowser, () => { failed += 1; });
  assert.equal(ok, true);
  assert.equal(failed, 0);
  assert.deepEqual(Linking.calls, ['https://apmex.com']);
});

test('App.js opens every dealer link through a bound opener', () => {
  // App.js isn't under test, so this reads the source.
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  const calls = app.match(/openDealerLink\([^)]*\)/g) || [];
  assert.equal(calls.length, 4);
  for (const call of calls) assert.match(call, /, openInBrowser, showDealerLinkFailed\)$/);
  assert.match(app, /const openInBrowser = \(url\) => Linking\.openURL\(url\);/);
});
