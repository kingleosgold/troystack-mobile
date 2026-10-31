// Run with: node --test mobile-app/src/utils/dealerLink.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isWebUrl, openDealerLink, onceUntilDismissed } from './dealerLink.js';

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

test('a burst of failed taps shows one notice until it is dismissed', async () => {
  let t = 0;
  const dismissals = [];
  const notify = onceUntilDismissed((dismiss) => { dismissals.push(dismiss); }, { now: () => t });
  const dead = () => Promise.reject(new Error('no browser'));
  await Promise.all([1, 2, 3].map(() => openDealerLink('https://apmex.com', dead, notify)));
  assert.equal(dismissals.length, 1);
  t = 5000;
  assert.equal(notify(), false);
  dismissals[0]();
  assert.equal(notify(), true);
  assert.equal(dismissals.length, 2);
});

test('a notice whose dismiss never fires stops blocking after staleMs', () => {
  let t = 0;
  let shown = 0;
  const notify = onceUntilDismissed(() => { shown += 1; }, { now: () => t, staleMs: 10000 });
  assert.equal(notify(), true);
  t = 9999;
  assert.equal(notify(), false);
  t = 10000;
  assert.equal(notify(), true);
  assert.equal(shown, 2);
});

test('a notice that throws does not block the next one', () => {
  let calls = 0;
  const notify = onceUntilDismissed(() => { calls += 1; if (calls === 1) throw new Error('boom'); });
  assert.throws(() => notify());
  assert.equal(notify(), true);
  assert.equal(calls, 2);
});

test('App.js wraps the dealer alert so taps cannot stack it', () => {
  const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');
  assert.match(app, /const showDealerLinkFailed = onceUntilDismissed\(\(dismiss\) => \{/);
  assert.match(app, /\[\{ text: 'OK', onPress: dismiss \}\],\s*\{ cancelable: true, onDismiss: dismiss \}/);
});

test('a late dismiss from a stale notice does not open the gate of a newer one', () => {
  let t = 0;
  const dismissals = [];
  const notify = onceUntilDismissed((dismiss) => { dismissals.push(dismiss); }, { now: () => t, staleMs: 10000 });
  assert.equal(notify(), true);
  t = 11000;
  assert.equal(notify(), true);
  dismissals[0]();
  t = 12000;
  assert.equal(notify(), false);
  dismissals[1]();
  assert.equal(notify(), true);
  assert.equal(dismissals.length, 3);
});

test('a dismiss fired twice still clears only its own notice', () => {
  let t = 0;
  const dismissals = [];
  const notify = onceUntilDismissed((dismiss) => { dismissals.push(dismiss); }, { now: () => t });
  assert.equal(notify(), true);
  dismissals[0]();
  assert.equal(notify(), true);
  dismissals[0]();
  assert.equal(notify(), false);
});

test('an onFail that throws never makes the open reject', async () => {
  const boom = () => { throw new Error('no alert'); };
  assert.equal(await openDealerLink('https://apmex.com', () => Promise.reject(new Error('no browser')), boom), false);
  assert.equal(await openDealerLink('javascript:alert(1)', () => {}, boom), false);
});

test('a bad link with a throwing onFail does not throw before returning', () => {
  const boom = () => { throw new Error('no alert'); };
  let result;
  assert.doesNotThrow(() => { result = openDealerLink('tel:5551234', () => {}, boom); });
  assert.ok(result instanceof Promise);
});

// Sets __DEV__ for fn and puts back whatever was there before, absent included
async function withDev(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, '__DEV__');
  const prior = globalThis.__DEV__;
  if (value === undefined) delete globalThis.__DEV__;
  else globalThis.__DEV__ = value;
  try {
    return await fn();
  } finally {
    if (had) globalThis.__DEV__ = prior;
    else delete globalThis.__DEV__;
  }
}

// Swaps console.warn for fn's run and hands back what it was called with
async function captureWarn(fn, warn) {
  const warned = [];
  const realWarn = console.warn;
  console.warn = warn || ((...args) => { warned.push(args); });
  try {
    await fn();
  } finally {
    console.warn = realWarn;
  }
  return warned;
}

const boom = () => { throw new Error('no alert'); };
const dead = () => Promise.reject(new Error('no browser'));

test('a swallowed onFail error is logged in a dev build only', async () => {
  for (const dev of [undefined, false]) {
    const warned = await captureWarn(() => withDev(dev, async () => {
      assert.equal(await openDealerLink('tel:5551234', () => {}, boom), false);
      assert.equal(await openDealerLink('https://apmex.com', dead, boom), false);
    }));
    assert.equal(warned.length, 0, `__DEV__ ${dev}`);
  }
  const warned = await captureWarn(() => withDev(true, async () => {
    assert.equal(await openDealerLink('tel:5551234', () => {}, boom), false);
    assert.equal(await openDealerLink('https://apmex.com', dead, boom), false);
    assert.equal(await openDealerLink('https://apmex.com', () => {}, boom), true);
  }));
  assert.equal(warned.length, 2);
  for (const [prefix, err] of warned) {
    assert.match(prefix, /^\[dealerLink\] /);
    assert.equal(err.message, 'no alert');
  }
});

test('a dev build log that throws never makes the open throw or reject', async () => {
  const throwingWarn = () => { throw new Error('log handler'); };
  await captureWarn(() => withDev(true, async () => {
    let result;
    assert.doesNotThrow(() => { result = openDealerLink('tel:5551234', () => {}, boom); });
    assert.equal(await result, false);
    assert.equal(await openDealerLink('https://apmex.com', dead, boom), false);
  }), throwingWarn);
});

test('the __DEV__ helper puts back a prior value', async () => {
  await withDev('outer', async () => {
    await withDev(true, async () => { assert.equal(globalThis.__DEV__, true); });
    assert.equal(globalThis.__DEV__, 'outer');
    await withDev(undefined, async () => { assert.equal('__DEV__' in globalThis, false); });
    assert.equal(globalThis.__DEV__, 'outer');
  });
  assert.equal('__DEV__' in globalThis, false);
});

test('a show that throws still turns an older notice dismiss into a no-op', () => {
  let t = 0;
  let calls = 0;
  const dismissals = [];
  const notify = onceUntilDismissed((dismiss) => {
    calls += 1;
    dismissals.push(dismiss);
    if (calls === 2) throw new Error('boom');
  }, { now: () => t, staleMs: 10000 });
  assert.equal(notify(), true);
  t = 11000;
  assert.throws(() => notify());
  assert.equal(notify(), true);
  dismissals[0]();
  dismissals[1]();
  t = 12000;
  assert.equal(notify(), false);
  dismissals[2]();
  assert.equal(notify(), true);
});
