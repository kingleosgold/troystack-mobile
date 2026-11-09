/**
 * TroyStack - Did a new price alert reach the server?
 *
 * Price alerts fire from the server, so an alert the server never saved can
 * never notify anyone, and the next sync drops a local-only alert the server
 * refuses. createPriceAlert used to say Alert Created whatever came back.
 * Now it only says so when the POST answered 2xx with success true, and
 * otherwise keeps the form filled and says the alert didn't save.
 * Nothing here imports React Native, so it runs under `node --test`.
 */

// response is the fetch Response, or null when the request threw.
// body is the parsed JSON, or null when it didn't parse.
export function alertSaved(response, body) {
  if (!response || !response.ok) return false;
  return !!(body && body.success === true);
}

export const ALERT_NOT_SAVED = {
  title: 'Alert Not Saved',
  message: "Your alert didn't save. Check your connection and try again.",
};

// A 400 or 422 means the server read the request and turned it down, so
// blaming the connection would send them retrying something that can't work.
export const ALERT_REJECTED = {
  title: 'Alert Not Saved',
  message: "The server didn't accept this alert. Check the price and try again.",
};

// response is the fetch Response, or null when the request threw.
export function alertNotSavedCopy(response) {
  if (response && (response.status === 400 || response.status === 422)) return ALERT_REJECTED;
  return ALERT_NOT_SAVED;
}

// syncAlertsFromBackend reads storage, then awaits a re-POST for each
// local-only alert. An alert created in that gap is on the screen and on the
// server but in neither list the sync read, so writing only those lists
// dropped it from the screen until the next sync. Keep any alert on the
// screen now whose id the sync never saw. An id it saw and didn't keep is an
// orphan the server refused, so it stays dropped.
// The same gap let a delete, a clear all or a toggle made while the sync ran
// come back from the server copy it read before. An alert that was on the
// screen when the sync started and is gone now was deleted, so it stays gone,
// and one whose switch moved since then keeps the switch the user set.
// current is the list on the screen now. atStart is the list on the screen
// when the sync started. seenIds holds every id the sync read from the server
// or from storage.
export function mergeSyncedAlerts({ backendAlerts, syncedLocal, seenIds, current, atStart, deleted }) {
  const nowById = new Map((current || []).map(a => [a.id, a]));
  const startById = new Map((atStart || []).map(a => [a.id, a]));
  const kept = [...backendAlerts, ...syncedLocal]
    .filter(a => !(startById.has(a.id) && !nowById.has(a.id)) && !(deleted && deleted.has(a.id)))
    .map(a => {
      const was = startById.get(a.id);
      const is = nowById.get(a.id);
      if (was && is && was.enabled !== is.enabled) return { ...a, enabled: is.enabled };
      return a;
    });
  const keptIds = new Set(kept.map(a => a.id));
  const createdSince = (current || []).filter(a => !keptIds.has(a.id) && !seenIds.has(a.id));
  return [...createdSince, ...kept];
}

// An alert deleted while the sync ran shouldn't go back up to the server.
// It was on the screen when the sync started and isn't on it now. One made
// after the sync started and deleted since isn't in atStart, so deleted, the
// ids the user deleted this session, catches it.
export function deletedSinceStart(id, atStart, current, deleted) {
  if (deleted && deleted.has(id)) return true;
  return (atStart || []).some(a => a.id === id) && !(current || []).some(a => a.id === id);
}

// Ids of server alerts the user deleted this session, so a sync can send
// their DELETE again.
export function deletedOnServer(backendAlerts, deleted) {
  if (!deleted || !deleted.size) return [];
  return (backendAlerts || []).filter(a => a && deleted.has(a.id)).map(a => a.id);
}

/**
 * The list to show once the stored alerts load. If nothing changed on the
 * screen while they loaded, that's the stored list. If an alert was made in
 * the meantime, the screen's list stays and the stored alerts it doesn't
 * carry are added after it, so neither the new alert nor the stored ones are
 * lost, unless one was on the screen at the start and is gone now.
 * @param {Array<{id: string}>} stored
 * @param {Array<{id: string}>} atStart the list when the load began
 * @param {Array<{id: string}>} current the list now
 * Alerts Create couldn't write to storage are on the screen and missing from
 * the stored list, so a load that starts after them keeps them first rather
 * than hide them until the next sync.
 * @param {Array<{id: string}>} surfaced stored alerts Create put on the screen
 * @param {Array<string>} unsaved ids Create put on the screen but not in storage
 * @param {Set<string>|null} deleted ids the user deleted this session
 */
export function loadedAlerts(stored, atStart, current, surfaced = [], unsaved = [], deleted = null) {
  // A stored copy of an alert the user deleted this session, read before the
  // delete's save landed, stays gone. The list keeps its identity when none
  // is, so the caller can tell nothing changed.
  const all = Array.isArray(stored) ? stored : [];
  const gone = deleted && deleted.size ? all.filter(a => a && deleted.has(a.id)) : [];
  const list = gone.length ? all.filter(a => !gone.includes(a)) : all;
  if (current === atStart) {
    const keep = new Set(unsaved || []);
    if (!keep.size) return list;
    const ids = new Set(list.filter(Boolean).map(a => a.id));
    const pending = (current || []).filter(a => a && keep.has(a.id) && !ids.has(a.id));
    return pending.length ? [...pending, ...list] : list;
  }
  // Stored alerts Create put on the screen count as there at the start, so
  // one deleted since stays gone.
  const baseline = [...(atStart || []), ...(surfaced || [])];
  const have = new Set((current || []).map(a => a.id));
  // A stored alert that was on the screen when the load began and is gone
  // now was deleted, or dropped by a sync, while it loaded, so it stays gone.
  return [
    ...(current || []),
    ...list.filter(a => a && !have.has(a.id) && !deletedSinceStart(a.id, baseline, current)),
  ];
}

/**
 * The list after Create Alert saves. The new alert goes first, then the list
 * on the screen. stored is the stored list when no load or sync has read it
 * yet this launch, else null. Its alerts the screen doesn't carry go after,
 * so the save doesn't write over them.
 * @param {{id: string}} alert
 * @param {Array<{id: string}>} current
 * @param {Array<{id: string}>|null} stored
 */
export function withCreatedAlert(alert, current, stored) {
  const list = (current || []).filter(a => a && a.id !== alert.id);
  const have = new Set(list.map(a => a.id));
  have.add(alert.id);
  const extra = Array.isArray(stored) ? stored.filter(a => a && a.id && !have.has(a.id)) : [];
  return [alert, ...list, ...extra];
}

// Whether the alert sync runs now, given the account that last got one
// ({ ran, userId }) and the account signed in now (id or null). The first
// sync of a launch runs for whoever is here, guest included. After that a
// sync runs only when an account lands that hasn't had one since it signed
// in, so a session that lands after the launch sync, or a guest who signs
// in, gets its account's alerts now rather than next launch. A sign out runs
// none, since the guest list would be the device's, and it clears the
// account so signing back in syncs again.
export function nextAlertSync(last, id) {
  const userId = id || null;
  if (!last.ran) return { run: true, last: { ran: true, userId } };
  if (!userId) return { run: false, last: { ran: true, userId: null } };
  if (userId === last.userId) return { run: false, last };
  return { run: true, last: { ran: true, userId } };
}

/**
 * The list to save after a toggle or a delete made before any load or sync
 * read the stored alerts. The screen list then lacks them, so saving it alone
 * would write over them. The screen's alerts go first, as they are now, then
 * the stored ones it doesn't carry, leaving out any id just deleted.
 * @param {Array<{id: string}>} current the list on the screen now
 * @param {Array<{id: string}>} stored the stored list
 * @param {Array<string>} removedIds ids deleted by this change
 */
export function withStoredAlerts(current, stored, removedIds = []) {
  const list = (current || []).filter(Boolean);
  const have = new Set(list.map(a => a.id));
  const gone = new Set(removedIds || []);
  const extra = Array.isArray(stored)
    ? stored.filter(a => a && a.id && !have.has(a.id) && !gone.has(a.id))
    : [];
  return [...list, ...extra];
}

// The account whose alerts are in storage, written with them whenever an
// account is signed in. A session that expired without a sign out leaves the
// last account's alerts behind, and the next account's sync would send them
// up as its own. A guest's save leaves it alone, and a sign out removes it.
export const ALERTS_OWNER_KEY = 'stack_price_alerts_owner';

// Whether the stored alerts belong to an account other than accountId (an
// account id, or null for a guest). No owner is a guest's list or one an
// older build saved, which stays as before.
export function alertsOwnedElsewhere(owner, accountId) {
  return !!owner && owner !== (accountId || null);
}

// The stored alerts (raw JSON or null) an account may read in. Another
// account's are on the server under that account, so a signed-in account
// reads none of them. A guest still reads them, since a launch reads storage
// before the stored session lands.
export function storedAlertsFor(val, owner, accountId) {
  if (accountId && alertsOwnedElsewhere(owner, accountId)) return null;
  return val;
}
