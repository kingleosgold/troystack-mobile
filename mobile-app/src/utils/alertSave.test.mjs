// Run with: node --test mobile-app/src/utils/alertSave.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alertSaved, alertNotSavedCopy, mergeSyncedAlerts, deletedSinceStart, loadedAlerts, withCreatedAlert, nextAlertSync, withStoredAlerts, ALERT_NOT_SAVED, ALERT_REJECTED, ALERTS_OWNER_KEY, alertsOwnedElsewhere, storedAlertsFor } from './alertSave.js';

const appJs = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

test('a 2xx with success true is saved', () => {
  assert.equal(alertSaved({ ok: true, status: 200 }, { success: true }), true);
  assert.equal(alertSaved({ ok: true, status: 201 }, { success: true, alert: {} }), true);
});

test('a thrown request is not saved', () => {
  assert.equal(alertSaved(null, null), false);
});

test('a non-2xx is not saved, even with success true in the body', () => {
  assert.equal(alertSaved({ ok: false, status: 500 }, { success: true }), false);
  assert.equal(alertSaved({ ok: false, status: 401 }, { error: 'Unauthorized' }), false);
});

test('a 2xx without success true is not saved', () => {
  assert.equal(alertSaved({ ok: true, status: 200 }, null), false);
  assert.equal(alertSaved({ ok: true, status: 200 }, { success: false, error: 'x' }), false);
  assert.equal(alertSaved({ ok: true, status: 200 }, {}), false);
});

test('the not saved words carry no em dash and no promise', () => {
  assert.doesNotMatch(ALERT_NOT_SAVED.title + ALERT_NOT_SAVED.message, /—|notif/i);
});

test('createPriceAlert only says Alert Created after the server saved it', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  assert.ok(start > 0 && end > start);
  const fn = appJs.slice(start, end);
  const gate = fn.indexOf('if (!saved)');
  assert.ok(gate > 0, 'createPriceAlert checks alertSaved');
  assert.ok(fn.indexOf('alertSaved(') < gate);
  assert.ok(fn.indexOf('alertNotSavedCopy(') > gate);
  assert.ok(fn.indexOf('savePriceAlerts(') > gate, 'nothing saves locally before the gate');
  assert.ok(fn.indexOf("'Alert Created'") > gate);
});

test('a 400 or 422 says the server turned it down, anything else blames the connection', () => {
  assert.equal(alertNotSavedCopy({ ok: false, status: 400 }), ALERT_REJECTED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 422 }), ALERT_REJECTED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 500 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy({ ok: false, status: 401 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy({ ok: true, status: 200 }), ALERT_NOT_SAVED);
  assert.equal(alertNotSavedCopy(null), ALERT_NOT_SAVED);
});

test('the rejected words carry no em dash and no promise', () => {
  assert.doesNotMatch(ALERT_REJECTED.title + ALERT_REJECTED.message, /\u2014|notif/i);
});

test('createPriceAlert adds to the latest list, not the one from before the await', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  const fn = appJs.slice(start, end);
  assert.ok(fn.includes('priceAlertsRef.current'), 'reads the ref');
  assert.doesNotMatch(fn, /\.\.\.priceAlerts\]/, 'no spread of the closed-over list');
});

test('Create Alert shows it is busy while the save is out', () => {
  assert.match(appJs, /onPress=\{createPriceAlert\}\s*disabled=\{creatingAlert\}/);
});

test('a save that lands after a sign out, switch or wipe writes nothing to the phone', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const end = appJs.indexOf('const togglePriceAlert = async');
  const fn = appJs.slice(start, end);
  const noted = fn.indexOf('const accountGen = accountChangedGenRef.current');
  const post = fn.indexOf("fetch(`${API_BASE_URL}/v1/push/price-alerts`");
  const check = fn.indexOf('if (accountChangedGenRef.current !== accountGen) return;');
  assert.ok(noted > 0 && noted < post, 'notes the account before the POST');
  assert.ok(check > post, 'checks it after the POST');
  assert.ok(check < fn.indexOf('if (!saved)'), 'before the not saved alert');
  assert.ok(check < fn.indexOf('savePriceAlerts('), 'before any local write');
  assert.ok(check < fn.indexOf("'Alert Created'"));
});

test('a sign out that failed leaves the alert owner count alone', () => {
  const start = appJs.indexOf('const performSignOut = async');
  const fn = appJs.slice(start, appJs.indexOf('\n  };', start));
  const failed = fn.indexOf('if (signOutError) return false;');
  const bumps = [...fn.matchAll(/accountChangedGenRef\.current \+= 1/g)].map((m) => m.index);
  assert.ok(failed > 0);
  assert.equal(bumps.length, 2);
  assert.ok(bumps[0] > failed, 'moves only after the sign out took');
});

test('a sign out moves the alert owner count again right before the stored alerts go', () => {
  const start = appJs.indexOf('const performSignOut = async');
  const fn = appJs.slice(start, appJs.indexOf('\n  };', start));
  const bumps = [...fn.matchAll(/accountChangedGenRef\.current \+= 1/g)].map((m) => m.index);
  const removed = fn.indexOf('await AsyncStorage.multiRemove(');
  const keys = fn.indexOf('await AsyncStorage.getAllKeys()');
  assert.ok(keys > 0 && removed > keys);
  assert.ok(bumps[0] < keys, 'the first bump comes before the reads');
  assert.ok(bumps[1] > keys && bumps[1] < removed, 'the second lands after the last await and right before the removal');
  assert.ok(!/await/.test(fn.slice(bumps[1], removed)), 'nothing awaited between it and the removal');
});

test('a sync keeps an alert created while its re-POSTs were out', () => {
  const backendAlerts = [{ id: 'b1' }];
  const syncedLocal = [{ id: 'l1' }];
  const seenIds = new Set(['b1', 'l1', 'orphan']);
  const current = [{ id: 'new' }, { id: 'b1' }, { id: 'orphan' }];
  const final = mergeSyncedAlerts({ backendAlerts, syncedLocal, seenIds, current });
  assert.deepEqual(final.map(a => a.id), ['new', 'b1', 'l1']);
});

test('a sync drops an orphan the server refused even if it is still on the screen', () => {
  const final = mergeSyncedAlerts({ backendAlerts: [], syncedLocal: [], seenIds: new Set(['x']), current: [{ id: 'x' }] });
  assert.deepEqual(final, []);
});

test('a sync with nothing on the screen writes the server and synced lists', () => {
  const final = mergeSyncedAlerts({ backendAlerts: [{ id: 'b' }], syncedLocal: [{ id: 'l' }], seenIds: new Set(['b', 'l']), current: undefined });
  assert.deepEqual(final.map(a => a.id), ['b', 'l']);
});

test('syncAlertsFromBackend merges into the latest list and writes nothing after an account change', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  assert.ok(start > 0 && end > start);
  const fn = appJs.slice(start, end);
  const loop = fn.indexOf('for (const alert of localOnly)');
  const merge = fn.indexOf('mergeSyncedAlerts(');
  const gate = fn.indexOf('accountChangedGenRef.current !== accountGen');
  assert.ok(fn.indexOf('const accountGen = accountChangedGenRef.current') >= 0);
  assert.ok(loop > 0 && gate > loop && merge > gate, 'the gate and the merge come after the re-POSTs');
  assert.ok(fn.indexOf('priceAlertsRef.current', merge) > merge);
  assert.ok(fn.indexOf('setPriceAlerts(final)') > merge);
});

test('an alert deleted while the sync ran stays gone', () => {
  const atStart = [{ id: 'a', enabled: true }, { id: 'b', enabled: true }];
  const current = [{ id: 'b', enabled: true }];
  const final = mergeSyncedAlerts({
    backendAlerts: [{ id: 'a', enabled: true }, { id: 'b', enabled: true }],
    syncedLocal: [], seenIds: new Set(['a', 'b']), current, atStart,
  });
  assert.deepEqual(final.map(a => a.id), ['b']);
});

test('a clear all while the sync ran stays cleared', () => {
  const atStart = [{ id: 'a' }, { id: 'l' }];
  const final = mergeSyncedAlerts({
    backendAlerts: [{ id: 'a' }], syncedLocal: [{ id: 'l' }], seenIds: new Set(['a', 'l']), current: [], atStart,
  });
  assert.deepEqual(final, []);
});

test('a toggle made while the sync ran keeps the switch the user set', () => {
  const final = mergeSyncedAlerts({
    backendAlerts: [{ id: 'a', enabled: true, targetPrice: 30 }],
    syncedLocal: [], seenIds: new Set(['a']),
    atStart: [{ id: 'a', enabled: true }], current: [{ id: 'a', enabled: false }],
  });
  assert.deepEqual(final, [{ id: 'a', enabled: false, targetPrice: 30 }]);
});

test('a switch nobody touched during the sync takes the server copy', () => {
  const final = mergeSyncedAlerts({
    backendAlerts: [{ id: 'a', enabled: true }], syncedLocal: [], seenIds: new Set(['a']),
    atStart: [{ id: 'a', enabled: false }], current: [{ id: 'a', enabled: false }],
  });
  assert.equal(final[0].enabled, true);
});

test('a sync that started before the list loaded drops nothing it kept', () => {
  const final = mergeSyncedAlerts({
    backendAlerts: [{ id: 'a' }], syncedLocal: [{ id: 'l' }], seenIds: new Set(['a', 'l']), current: [], atStart: [],
  });
  assert.deepEqual(final.map(a => a.id), ['a', 'l']);
});

test('deletedSinceStart only counts an alert that left the screen', () => {
  assert.equal(deletedSinceStart('a', [{ id: 'a' }], []), true);
  assert.equal(deletedSinceStart('a', [{ id: 'a' }], [{ id: 'a' }]), false);
  assert.equal(deletedSinceStart('a', [], []), false);
  assert.equal(deletedSinceStart('a', undefined, undefined), false);
});

test('syncAlertsFromBackend notes the screen at start and skips re-POSTing a deleted alert', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, end);
  const snap = fn.indexOf('const atStart = priceAlertsRef.current');
  assert.ok(snap > 0 && snap < fn.indexOf('await getDeviceId()'), 'snapshots before the first await');
  const loop = fn.indexOf('for (const alert of localOnly)');
  const skip = fn.indexOf('deletedSinceStart(alert.id, [...alertsSurfacedRef.current, ...atStart], priceAlertsRef.current, alertsDeletedRef.current)');
  assert.ok(skip > loop && skip < fn.indexOf('method: \'POST\''));
  assert.match(fn, /mergeSyncedAlerts\(\{[^}]*atStart: \[\.\.\.alertsSurfacedRef\.current, \.\.\.atStart\]/);
});

test('a re-POST that lands after a delete deletes it again, but never after an account change', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, end);
  const ok = fn.indexOf('if (r.success)');
  const gen = fn.indexOf('if (accountChangedGenRef.current !== accountGen) break;', ok);
  const again = fn.indexOf('deletedSinceStart(alert.id, [...alertsSurfacedRef.current, ...atStart], priceAlertsRef.current, alertsDeletedRef.current)', ok);
  const del = fn.indexOf("method: 'DELETE'", ok);
  assert.ok(ok > 0 && gen > ok && again > gen && del > again);
  assert.match(fn, /syncedLocal\.push\(\{ \.\.\.alert, enabled \}\)/);
});

test('toggle, delete and clear all update the ref the sync reads straight away', () => {
  for (const [name, next] of [
    ['const togglePriceAlert = async', 'const deletePriceAlert = async'],
    ['const deletePriceAlert = async', 'const deletePriceAlertDirect = async'],
    ['const deletePriceAlertDirect = async', 'const clearAllAlerts = '],
    ['const clearAllAlerts = ', 'HOME SCREEN WIDGET'],
  ]) {
    const fn = appJs.slice(appJs.indexOf(name), appJs.indexOf(next));
    assert.match(fn, /priceAlertsRef\.current = /, name);
    assert.ok(fn.indexOf('priceAlertsRef.current = ') < fn.indexOf('setPriceAlerts('), name);
  }
});

test('the re-POST loop checks the account before every POST', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, end);
  const loop = fn.indexOf('for (const alert of localOnly)');
  const headers = fn.indexOf("const postHeaders = await withSession(", loop);
  const gate = fn.indexOf('if (accountChangedGenRef.current !== accountGen) break;', loop);
  const post = fn.indexOf("method: 'POST'", loop);
  assert.ok(loop > 0 && headers > loop && gate > headers && gate < post,
    'the session is read, then the account checked, then the POST sent');
  assert.match(fn, /headers: postHeaders/);
  const noToken = fn.indexOf('if (userId && !postHeaders.Authorization) return;', headers);
  assert.ok(noToken > headers && noToken < post, 'a signed-in sync with no token sends nothing and writes nothing');
});

test('the cleanup DELETE checks the account after reading the session', () => {
  const start = appJs.indexOf('const syncAlertsFromBackend = async');
  const end = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, end);
  const read = fn.indexOf('const delHeaders = await withSession()');
  const gate = fn.indexOf('if (accountChangedGenRef.current !== accountGen) break;', read);
  const del = fn.indexOf("method: 'DELETE'", read);
  assert.ok(read > 0 && gate > read && del > gate);
  assert.match(fn, /headers: delHeaders/);
});

test('a single alert toggle or delete carries the session token', () => {
  const start = appJs.indexOf('const togglePriceAlert = async');
  const end = appJs.indexOf('const clearAllAlerts = ');
  assert.ok(start > 0 && end > start);
  const fns = appJs.slice(start, end);
  const calls = fns.split('/v1/push/price-alerts/${alertId}`').slice(1);
  assert.equal(calls.length, 3, 'one PATCH and two DELETEs');
  for (const call of calls) {
    const opts = call.slice(0, call.indexOf('});'));
    assert.match(opts, /headers: await withSession\(/);
  }
});

test('the stored alerts load as is when nothing changed while loading', () => {
  const start = [];
  const stored = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(loadedAlerts(stored, start, start), stored);
  assert.deepEqual(loadedAlerts(null, start, start), []);
});

test('an alert made while the stored list loaded stays, with the stored ones after it', () => {
  const start = [];
  const current = [{ id: 'new' }];
  assert.deepEqual(loadedAlerts([{ id: 'a' }, { id: 'new' }], start, current), [{ id: 'new' }, { id: 'a' }]);
});

test('fetchPriceAlerts moves the ref with the list and skips after an account change', () => {
  const start = appJs.indexOf('const fetchPriceAlerts = async');
  const end = appJs.indexOf('const savePriceAlerts = async');
  const fn = appJs.slice(start, end);
  const read = fn.indexOf("await readStoredAlerts()");
  const gate = fn.indexOf('if (accountChangedGenRef.current !== accountGen) return;');
  const ref = fn.indexOf('priceAlertsRef.current = parsed;');
  const set = fn.indexOf('setPriceAlerts(parsed);');
  assert.ok(read > 0 && gate > read && ref > gate && set > ref);
  assert.match(fn, /loadedAlerts\(stored, atStart, priceAlertsRef\.current, alertsSurfacedRef\.current, unsaved, alertsDeletedRef\.current\)/);
  assert.ok(fn.indexOf('if (parsed !== stored) await savePriceAlerts(parsed);') > set, 'a merged list is saved');
});

test('a stored alert deleted or dropped while the list loaded stays gone', () => {
  const x = { id: 'x' }, y = { id: 'y' };
  const start = [x, y];
  const current = [y];
  assert.deepEqual(loadedAlerts([x, y], start, current), [y]);
});

test('a load with nothing changed returns the stored array itself, so nothing is saved again', () => {
  const start = [];
  const stored = [{ id: 'a' }];
  assert.equal(loadedAlerts(stored, start, start), stored);
});

test('a stored list that is not an array or holds nulls merges safely', () => {
  assert.deepEqual(loadedAlerts({}, [], [{ id: 'n' }]), [{ id: 'n' }]);
  assert.deepEqual(loadedAlerts([null, { id: 'a' }], [], [{ id: 'n' }]), [{ id: 'n' }, { id: 'a' }]);
});

test('a load returns without writing when a sync landed while it read', () => {
  const start = appJs.indexOf('const fetchPriceAlerts = async');
  const end = appJs.indexOf('const savePriceAlerts = async');
  const fn = appJs.slice(start, end);
  const read = fn.indexOf("await readStoredAlerts()");
  const gate = fn.indexOf('if (alertsSyncGenRef.current !== syncGen) return;');
  assert.ok(fn.indexOf('const syncGen = alertsSyncGenRef.current;') < read);
  assert.ok(gate > read && gate < fn.indexOf('setPriceAlerts(parsed);'));
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), appJs.indexOf('const createPriceAlert = async'));
  assert.ok(sync.indexOf('alertsSyncGenRef.current += 1;') < sync.indexOf('setPriceAlerts(final);'));
});

test('a load that lands moves the count so an overlapping load stands down', () => {
  const fn = appJs.slice(appJs.indexOf('const fetchPriceAlerts = async'), appJs.indexOf('const savePriceAlerts = async'));
  const gate = fn.indexOf('if (alertsSyncGenRef.current !== syncGen) return;');
  const bump = fn.indexOf('alertsSyncGenRef.current += 1;');
  assert.ok(gate > 0 && bump > gate && bump < fn.indexOf('setPriceAlerts(parsed);'));
  assert.ok(bump < fn.indexOf('JSON.parse(val)'));
  // Why: the later load would re-add a stored alert deleted between them.
  const x = { id: 'x' };
  assert.deepEqual(loadedAlerts([x], [], []), [x]);
});

test('a toggle made while the list loaded wins over the stored copy', () => {
  const start = [];
  const current = [{ id: 'a', enabled: false }];
  assert.deepEqual(loadedAlerts([{ id: 'a', enabled: true }, { id: 'b' }], start, current), [{ id: 'a', enabled: false }, { id: 'b' }]);
});

test('withCreatedAlert keeps the stored alerts when nothing loaded them yet', () => {
  const n = { id: 'n' };
  assert.deepEqual(withCreatedAlert(n, [], [{ id: 'a', enabled: false }, { id: 'b' }]), [n, { id: 'a', enabled: false }, { id: 'b' }]);
  assert.deepEqual(withCreatedAlert(n, [{ id: 'a' }], [{ id: 'a', enabled: false }, null, { id: 'n' }]), [n, { id: 'a' }]);
  assert.deepEqual(withCreatedAlert(n, [{ id: 'a' }, { id: 'n' }], null), [n, { id: 'a' }]);
  assert.deepEqual(withCreatedAlert(n, [{ id: 'a' }], {}), [n, { id: 'a' }]);
});

test('createPriceAlert reads storage only before a load or sync, and loads and syncs mark it read', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, appJs.indexOf('const togglePriceAlert = async', start));
  assert.match(fn, /if \(!alertsLoadedRef\.current\) \{[\s\S]*?readStoredAlerts\(\)[\s\S]*?accountChangedGenRef\.current !== accountGen\) return;[\s\S]*?if \(alertsLoadedRef\.current\) stored = null;/);
  assert.match(fn, /withCreatedAlert\(alert, priceAlertsRef\.current, stored\)/);
  const load = appJs.slice(appJs.indexOf('const fetchPriceAlerts = async'), appJs.indexOf('const savePriceAlerts = async'));
  assert.match(load, /alertsSyncGenRef\.current !== syncGen\) return;\s*alertsLoadedRef\.current = true;/);
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), start);
  assert.match(sync, /alertsSyncGenRef\.current \+= 1;\s*alertsLoadedRef\.current = true;/);
});

test('a stored alert Create surfaced and the user then deleted stays gone after a load or sync', () => {
  const s1 = { id: 's1' }, s2 = { id: 's2' }, n = { id: 'n' };
  // The load began on an empty screen, Create surfaced s1 and s2, then s1 was deleted.
  assert.deepEqual(loadedAlerts([s1, s2], [], [n, s2], [s1, s2]), [n, s2]);
  // Without the surfaced list it would come back, which is the bug.
  assert.deepEqual(loadedAlerts([s1, s2], [], [n, s2]), [n, s2, s1]);
  // The sync passes the same baseline, so its server copy of s1 is dropped and a toggle of s2 keeps.
  const out = mergeSyncedAlerts({
    backendAlerts: [{ id: 's1', enabled: true }, { id: 's2', enabled: true }],
    syncedLocal: [], seenIds: new Set(['s1', 's2']),
    current: [n, { id: 's2', enabled: false }],
    atStart: [...[], { id: 's1', enabled: true }, { id: 's2', enabled: true }],
  });
  assert.deepEqual(out, [n, { id: 's2', enabled: false }]);
  assert.equal(deletedSinceStart('s1', [s1, s2], [n, s2]), true);
});

test('createPriceAlert notes the stored alerts it surfaced and marks the list read', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, appJs.indexOf('const togglePriceAlert = async', start));
  assert.match(fn, /if \(stored\) \{[\s\S]*?alertsSurfacedRef\.current = \[[\s\S]*?\}[\s\S]*?if \(readStored\) alertsLoadedRef\.current = true;\s*priceAlertsRef\.current = updated;/);
  assert.match(fn, /JSON\.parse\(val\) : null;\s*storedOwner = valOwner;\s*readStored = true;/);
});

test('a stored alerts read that throws in Create keeps the store as it was', () => {
  const start = appJs.indexOf('const createPriceAlert = async');
  const fn = appJs.slice(start, appJs.indexOf('const togglePriceAlert = async', start));
  // The flag is up across getItem and down before JSON.parse, so only a
  // thrown read, never corrupt JSON, skips the save.
  assert.match(fn, /readThrew = true;\s*const \[val, valOwner\] = await readStoredAlerts\(\);\s*readThrew = false;\s*stored = val \? JSON\.parse\(val\) : null;/);
  // A load or sync that landed while it read wrote the store, so saving is safe again.
  assert.match(fn, /const skipLocalSave = readThrew && !alertsLoadedRef\.current;/);
  assert.match(fn, /if \(skipLocalSave\) alertsUnsavedRef\.current = \[\.\.\.alertsUnsavedRef\.current, alertId\];\s*else await savePriceAlerts\(updated\);/);
  assert.equal(fn.match(/savePriceAlerts\(/g).length, 1, 'no other local write in Create');
  // The screen still shows it.
  assert.ok(fn.indexOf('setPriceAlerts(updated)') < fn.indexOf('if (skipLocalSave)'));
});

test('an alert sync sends nothing for an account that is not the one signed in now', () => {
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), appJs.indexOf('const createPriceAlert = async'));
  // Checked after the headers resolve, right before the POST goes.
  assert.match(sync, /if \(userId && !postHeaders\.Authorization\) return;(\s*\/\/[^\n]*\n)+\s*if \(userId !== \(lastAccountIdRef\.current \|\| null\)\) return;\s*\/\/[^\n]*\n\s*const onScreen/);
  // It returns rather than breaks, since a break would merge and drop the
  // unsent local alerts as orphans.
  assert.ok(!/lastAccountIdRef\.current \|\| null\)\) break/.test(sync));
  // The ref still names the account signing out until the session goes, so
  // a guest sync is stopped through the server sign out too.
  const start = appJs.indexOf('const performSignOut = async () => {');
  const signOut = appJs.slice(start, appJs.indexOf('// Helper function to format currency', start));
  assert.ok(!/lastAccountIdRef\.current =/.test(signOut));
});

test('an alert sync merges nothing onto a screen that belongs to another account', () => {
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), appJs.indexOf('const createPriceAlert = async'));
  // Right after the count check and before the merge, so a guest sync that
  // reached no POST can't lay the guest list over a signed-in screen.
  assert.match(sync, /if \(accountChangedGenRef\.current !== accountGen\) return;(\s*\/\/[^\n]*\n)+\s*if \(userId !== \(lastAccountIdRef\.current \|\| null\)\) return;\s*\n\s*\/\/ Keep backend alerts/);
  const check = sync.lastIndexOf('if (userId !== (lastAccountIdRef.current || null)) return;');
  assert.ok(check < sync.indexOf('mergeSyncedAlerts('));
  assert.ok(check < sync.indexOf('setPriceAlerts(final)'));
  assert.ok(check < sync.indexOf('await savePriceAlerts(final)'));
});

test('the alert sync reruns when an account lands after the launch sync', () => {
  const start = { ran: false, userId: null };
  // Launch as a guest or before the session lands.
  let s = nextAlertSync(start, null);
  assert.equal(s.run, true);
  // The restored session or a guest's sign in lands.
  s = nextAlertSync(s.last, 'a');
  assert.equal(s.run, true);
  // A rerender with the same account runs nothing.
  assert.equal(nextAlertSync(s.last, 'a').run, false);
  // A switch straight to another account syncs it.
  const b = nextAlertSync(s.last, 'b');
  assert.equal(b.run, true);
  // A sign out runs none, and signing back in to the same account syncs again.
  const out = nextAlertSync(b.last, null);
  assert.equal(out.run, false);
  assert.equal(nextAlertSync(out.last, 'b').run, true);
  // A launch with the session already there runs once.
  const signedIn = nextAlertSync(start, 'a');
  assert.equal(signedIn.run, true);
  assert.equal(nextAlertSync(signedIn.last, 'a').run, false);
  assert.equal(nextAlertSync(start, undefined).last.userId, null);
});

test('the alert sync effect follows the signed-in account', () => {
  assert.match(appJs, /const next = nextAlertSync\(alertSyncLastRef\.current, supabaseUser\?\.id\);\s*alertSyncLastRef\.current = next\.last;\s*if \(!next\.run\) return;[\s\S]{0,120}?syncAlertsFromBackend\(\);\s*\}, \[dataLoaded, authLoading, supabaseUser\?\.id\]\);/);
  // The layout effect that names the account runs before it, so the sync's
  // account check passes for the account that just landed.
  assert.ok(appJs.indexOf('lastAccountIdRef.current = supabaseUser?.id || null;') < appJs.indexOf('nextAlertSync(alertSyncLastRef.current'));
});

test('a toggle or delete before any load keeps the stored alerts', () => {
  const made = { id: 'new', enabled: false };
  const stored = [{ id: 's1', enabled: true }, { id: 's2', enabled: false }];
  // The toggled alert keeps the screen's switch and the stored ones follow.
  assert.deepEqual(withStoredAlerts([made], stored), [made, ...stored]);
  // A stored copy of an alert on the screen doesn't come back over it.
  assert.deepEqual(withStoredAlerts([{ id: 's1', enabled: false }], stored), [{ id: 's1', enabled: false }, { id: 's2', enabled: false }]);
  // An id just deleted stays out even if storage still has it.
  assert.deepEqual(withStoredAlerts([], stored, ['s1']), [{ id: 's2', enabled: false }]);
  // Nothing stored, or junk in it, leaves the screen list.
  assert.deepEqual(withStoredAlerts([made], null), [made]);
  assert.deepEqual(withStoredAlerts([made], [null, {}, 3]), [made]);
});

test('toggle and both deletes save through the stored-list read', () => {
  const body = (start, end) => appJs.slice(appJs.indexOf(start), appJs.indexOf(end));
  const toggle = body('const togglePriceAlert = async', 'const deletePriceAlert = async');
  assert.match(toggle, /await saveAlertsAfterChange\(updated\);/);
  assert.doesNotMatch(toggle, /savePriceAlerts\(/);
  const del = body('const deletePriceAlert = async', 'const deletePriceAlertDirect = async');
  assert.match(del, /await saveAlertsAfterChange\(updated, \[alertId\]\);/);
  assert.doesNotMatch(del, /savePriceAlerts\(/);
  const direct = body('const deletePriceAlertDirect = async', 'const clearAllAlerts = ');
  assert.match(direct, /await saveAlertsAfterChange\(updated, \[alertId\]\);/);
  assert.doesNotMatch(direct, /savePriceAlerts\(/);
  const helper = body('const saveAlertsAfterChange = async', 'const syncAlertsFromBackend = async');
  // Only once a load or sync has the stored list does it save the screen alone.
  assert.match(helper, /if \(alertsLoadedRef\.current\) \{\s*await savePriceAlerts\(updated\);\s*return;\s*\}/);
  // A read that threw writes nothing.
  assert.match(helper, /\} catch \(e\) \{\s*return;\s*\}/);
  assert.match(helper, /withStoredAlerts\(current, stored, removedIds\)/);
  assert.match(helper, /alertsLoadedRef\.current = true;/);
});

test('clear all marks the empty list whole so a pending merge or load stands down', () => {
  const clear = appJs.slice(appJs.indexOf('const clearAllAlerts = '), appJs.indexOf('// HOME SCREEN WIDGET'));
  const flag = clear.indexOf('alertsLoadedRef.current = true;');
  const gen = clear.indexOf('alertsSyncGenRef.current += 1;');
  const save = clear.indexOf('await savePriceAlerts([]);');
  assert.ok(flag > 0 && gen > 0 && save > 0);
  assert.ok(flag < save && gen < save);
  // The helper rechecks the flag after its read and then saves the screen as is.
  const helper = appJs.slice(appJs.indexOf('const saveAlertsAfterChange = async'), appJs.indexOf('const syncAlertsFromBackend = async'));
  assert.match(helper, /if \(accountChangedGenRef\.current !== accountGen\) return;[\s\S]*?if \(alertsLoadedRef\.current\) \{\s*await savePriceAlerts\(priceAlertsRef\.current\);\s*return;\s*\}/);
});

test('a clear all stops a sync already out before its next POST and its commit', () => {
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), appJs.indexOf('const createPriceAlert = async'));
  // The sync notes the count before its GET.
  assert.ok(sync.indexOf('const clearedGen = alertsClearedRef.current;') < sync.indexOf('/v1/push/price-alerts?'));
  // Each POST checks it after reading the session, right before sending.
  assert.match(sync, /const clearedSinceStart = \(\) => alertsClearingRef\.current > 0 \|\| alertsClearedRef\.current !== clearedGen;/);
  assert.match(sync, /const postHeaders = await withSession\([\s\S]*?if \(clearedSinceStart\(\)\) return;[\s\S]*?method: 'POST'/);
  // A POST that lands after a clear all is deleted again, unless the alert is
  // on the screen now, which means it was made after the clear.
  assert.match(sync, /const cleared = clearedSinceStart\(\) && !priceAlertsRef\.current\.some\(a => a\.id === alert\.id\);\s*if \(cleared \|\| deletedSinceStart\(/);
  // The commit checks it before writing the list.
  const commit = sync.indexOf('const final = mergeSyncedAlerts(');
  const check = sync.lastIndexOf('if (clearedSinceStart()) return;', commit);
  assert.ok(check > sync.indexOf('for (const alert of localOnly)') && check < commit);
  // Only clear all moves it, before its save and again once the server DELETE settles.
  const clear = appJs.slice(appJs.indexOf('const clearAllAlerts = '), appJs.indexOf('// HOME SCREEN WIDGET'));
  assert.equal(appJs.match(/alertsClearedRef\.current \+= 1;/g).length, 2);
  assert.equal(clear.match(/alertsClearedRef\.current \+= 1;/g).length, 2);
  assert.ok(clear.indexOf('alertsClearedRef.current += 1;') < clear.indexOf('await savePriceAlerts([]);'));
  assert.match(clear, /method: 'DELETE',[\s\S]*?\} finally \{[\s\S]*?alertsClearedRef\.current \+= 1;\s*alertsClearingRef\.current -= 1;\s*\}/);
  // A clear counts as out from its first move until the finally, around its save too.
  const out = clear.indexOf('alertsClearingRef.current += 1;');
  assert.ok(out > 0 && out < clear.indexOf('try {') && clear.indexOf('try {') < clear.indexOf('await savePriceAlerts([]);'));
});

test('a load after a Create that could not save keeps the new alert on the screen', () => {
  const made = { id: 'new' };
  const start = [made];
  // The load starts after the create, so nothing moved while it ran.
  assert.deepEqual(loadedAlerts([{ id: 'a' }], start, start, [], ['new']), [made, { id: 'a' }]);
  // With nothing stored it still stays.
  assert.deepEqual(loadedAlerts(null, start, start, [], ['new']), [made]);
  // Once it is in the stored list the stored array stands as is.
  const stored = [{ id: 'new' }, { id: 'a' }];
  assert.equal(loadedAlerts(stored, start, start, [], ['new']), stored);
  // One deleted before the load is not on the screen, so it isn't kept.
  assert.deepEqual(loadedAlerts([{ id: 'a' }], [], [], [], ['new']), [{ id: 'a' }]);
  // With no unsaved ids a quiet load still returns the stored array itself.
  const s2 = [{ id: 'a' }];
  assert.equal(loadedAlerts(s2, start, start), s2);
});

test('the load clears the unsaved ids once it lands, and an account change clears them too', () => {
  const start = appJs.indexOf('const fetchPriceAlerts = async');
  const fn = appJs.slice(start, appJs.indexOf('const savePriceAlerts = async'));
  // It takes the ids before clearing them, so the merge still sees them.
  assert.match(fn, /alertsLoadedRef\.current = true;[\s\S]*?const unsaved = alertsUnsavedRef\.current;\s*alertsUnsavedRef\.current = \[\];[\s\S]*?loadedAlerts\(stored, atStart, priceAlertsRef\.current, alertsSurfacedRef\.current, unsaved, alertsDeletedRef\.current\)/);
  assert.match(appJs, /setPriceAlerts\(\[\]\);\s*alertsUnsavedRef\.current = \[\];/);
});

test('stored alerts another account left behind are not read in by the next account', () => {
  const val = '[{"id":"a"}]';
  // Another account's alerts read as none for a signed-in account.
  assert.equal(storedAlertsFor(val, 'acct-a', 'acct-b'), null);
  assert.equal(alertsOwnedElsewhere('acct-a', 'acct-b'), true);
  // The same account, no owner (a guest or an older build) read as before.
  assert.equal(storedAlertsFor(val, 'acct-a', 'acct-a'), val);
  assert.equal(storedAlertsFor(val, null, 'acct-b'), val);
  assert.equal(storedAlertsFor(val, undefined, 'acct-b'), val);
  assert.equal(alertsOwnedElsewhere(null, 'acct-b'), false);
  // A guest still reads them, since the stored session may not have landed yet.
  assert.equal(storedAlertsFor(val, 'acct-a', null), val);
  assert.equal(alertsOwnedElsewhere('acct-a', null), true);
  assert.equal(alertsOwnedElsewhere('acct-a', undefined), true);
});

test('every alert read goes through the owner, saves record it and a sign out removes it', () => {
  assert.equal(ALERTS_OWNER_KEY, 'stack_price_alerts_owner');
  // No path reads the stored list without its owner.
  assert.doesNotMatch(appJs, /getItem\('stack_price_alerts'\)/);
  const save = appJs.slice(appJs.indexOf('const savePriceAlerts = async'), appJs.indexOf('const saveAlertsAfterChange = async'));
  assert.match(save, /const owner = lastAccountIdRef\.current \|\| null;[\s\S]*?if \(owner\) \{\s*alertsOwnerRef\.current = owner;\s*await AsyncStorage\.multiSet\(\[\['stack_price_alerts', json\], \[ALERTS_OWNER_KEY, owner\]\]\);/);
  // A guest's own list drops the owner, one still showing an account's keeps it.
  assert.match(save, /await AsyncStorage\.setItem\('stack_price_alerts', json\);\s*if \(!alertsOwnerRef\.current\) await AsyncStorage\.removeItem\(ALERTS_OWNER_KEY\);/);
  // The sync reads none of another account's alerts, before any POST, and
  // counts their ids as seen so the screen's copy can't stay as created since.
  const sync = appJs.slice(appJs.indexOf('const syncAlertsFromBackend = async'), appJs.indexOf('const createPriceAlert = async'));
  const foreign = sync.indexOf('const localAlerts = foreign ? null : storedVal;');
  assert.ok(foreign > 0 && foreign < sync.indexOf("method: 'POST'"));
  assert.match(sync, /const seenIds = new Set\(\[\.\.\.backendIds, \.\.\.localParsed\.map\(a => a\.id\), \.\.\.foreignIds\]\);/);
  assert.match(sync, /alertsOwnerRef\.current = userId;\s*setPriceAlerts\(final\);\s*await savePriceAlerts\(final\);/);
  // It waits for the stored session to land.
  assert.match(appJs, /if \(!dataLoaded \|\| authLoading\) return;\s*const next = nextAlertSync/);
  assert.match(appJs, /\}, \[dataLoaded, authLoading, supabaseUser\?\.id\]\);/);
  // Another account landing clears the screen's list from the last one.
  assert.match(appJs, /if \(nextId && alertsOwnerRef\.current && alertsOwnerRef\.current !== nextId\) \{\s*priceAlertsRef\.current = \[\];\s*setPriceAlerts\(\[\]\);\s*alertsLoadedRef\.current = false;/);
  // Sign out removes the owner with the alerts.
  assert.match(appJs, /'stack_price_alerts',\s*ALERTS_OWNER_KEY,/);
});

test('a sync drops another account\'s alerts still on the screen rather than keep them as made since', () => {
  const a1 = { id: 'a1', enabled: true };
  const b1 = { id: 'b1', enabled: true };
  // Without their ids the screen copy would ride along as created since.
  assert.deepEqual(mergeSyncedAlerts({ backendAlerts: [b1], syncedLocal: [], seenIds: new Set(['b1']), current: [a1], atStart: [a1] }).map(a => a.id), ['a1', 'b1']);
  // With the stored ids counted as seen they go.
  assert.deepEqual(mergeSyncedAlerts({ backendAlerts: [b1], syncedLocal: [], seenIds: new Set(['b1', 'a1']), current: [a1], atStart: [a1] }).map(a => a.id), ['b1']);
});

test('an alert made after the sync started and deleted while its re-POST was out stays gone', () => {
  const made = { id: 'x', metal: 'gold', enabled: true };
  const deleted = new Set(['x']);
  // It isn't in the list the sync started with, so only the deleted set catches it.
  assert.equal(deletedSinceStart('x', [], [], deleted), true);
  assert.equal(deletedSinceStart('x', [], []), false);
  assert.equal(deletedSinceStart('y', [], [], deleted), false);
  const final = mergeSyncedAlerts({ backendAlerts: [], syncedLocal: [made], seenIds: new Set(['x']), current: [], atStart: [], deleted });
  assert.deepEqual(final, []);
});

test('a server copy of an alert deleted this session stays off the screen', () => {
  const kept = { id: 'k', enabled: true };
  const final = mergeSyncedAlerts({ backendAlerts: [{ id: 'x', enabled: true }, kept], syncedLocal: [], seenIds: new Set(['x', 'k']), current: [kept], atStart: [], deleted: new Set(['x']) });
  assert.deepEqual(final, [kept]);
});

test('a load drops a stored copy of an alert deleted this session, and keeps identity otherwise', () => {
  const a = { id: 'a' };
  const x = { id: 'x' };
  const stored = [a, x];
  assert.deepEqual(loadedAlerts(stored, [], [], [], [], new Set(['x'])), [a]);
  const now = [];
  assert.deepEqual(loadedAlerts(stored, now, now, [], [], new Set(['x'])), [a]);
  assert.equal(loadedAlerts(stored, now, now, [], [], new Set(['zzz'])), stored);
  assert.equal(loadedAlerts(stored, now, now, [], [], new Set()), stored);
  assert.equal(loadedAlerts(stored, now, now), stored);
});

test('both deletes note the id, the sync, merge and load read the set, and a wipe clears it', () => {
  assert.match(appJs, /const alertsDeletedRef = useRef\(new Set\(\)\);/);
  assert.equal((appJs.match(/alertsDeletedRef\.current\.add\(alertId\);\s*const updated = priceAlertsRef\.current\.filter\(a => a\.id !== alertId\);/g) || []).length, 2);
  assert.equal((appJs.match(/deletedSinceStart\(alert\.id, \[\.\.\.alertsSurfacedRef\.current, \.\.\.atStart\], priceAlertsRef\.current, alertsDeletedRef\.current\)/g) || []).length, 2);
  assert.match(appJs, /mergeSyncedAlerts\(\{[^}]*deleted: alertsDeletedRef\.current \}\)/);
  assert.match(appJs, /loadedAlerts\(stored, atStart, priceAlertsRef\.current, alertsSurfacedRef\.current, unsaved, alertsDeletedRef\.current\)/);
  assert.match(appJs, /alertsOwnerRef\.current = null;\s*alertsDeletedRef\.current = new Set\(\);/);
});
