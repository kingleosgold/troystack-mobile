// Run with: node --test mobile-app/src/utils/minVersion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMinVersion, isVersionBelow, requiredUpdate } from './minVersion.js';

const enforced = {
  enforced: true,
  message: 'Please update',
  ios: { minVersion: '3.0.7', store_url: 'https://apps.apple.com/x' },
  android: { minVersion: '3.0.5', store_url: 'https://play.google.com/x' },
};

test('compares versions part by part', () => {
  assert.equal(isVersionBelow('3.0.6', '3.0.7'), true);
  assert.equal(isVersionBelow('3.0.7', '3.0.7'), false);
  assert.equal(isVersionBelow('3.1.0', '3.0.9'), false);
  assert.equal(isVersionBelow('3.0', '3.0.1'), true);
  assert.equal(isVersionBelow('10.0.0', '9.9.9'), false);
});

test('an older version on an enforced platform gets the update screen', () => {
  assert.deepEqual(requiredUpdate(enforced, 'ios', '3.0.6'), { message: 'Please update', storeUrl: 'https://apps.apple.com/x' });
});

test('a current version, an unenforced check or an unlisted platform runs', () => {
  assert.equal(requiredUpdate(enforced, 'ios', '3.0.7'), null);
  assert.equal(requiredUpdate(enforced, 'android', '3.0.6'), null);
  assert.equal(requiredUpdate({ ...enforced, enforced: false }, 'ios', '3.0.0'), null);
  assert.equal(requiredUpdate(enforced, 'web', '1.0.0'), null);
  assert.equal(requiredUpdate(null, 'ios', '1.0.0'), null);
});

test('the check returns the update when the server enforces one', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => enforced });
  assert.deepEqual(await checkMinVersion({ fetchFn, platform: 'ios', appVersion: '3.0.0' }), { message: 'Please update', storeUrl: 'https://apps.apple.com/x' });
});

test('the check fails open on an error, a bad status or a timeout', async () => {
  assert.equal(await checkMinVersion({ fetchFn: async () => { throw new Error('offline'); }, platform: 'ios', appVersion: '3.0.0' }), null);
  assert.equal(await checkMinVersion({ fetchFn: async () => ({ ok: false }), platform: 'ios', appVersion: '3.0.0' }), null);
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const started = Date.now();
  assert.equal(await checkMinVersion({ fetchFn: hang, platform: 'ios', appVersion: '3.0.0', timeoutMs: 20 }), null);
  assert.ok(Date.now() - started < 1000);
});
