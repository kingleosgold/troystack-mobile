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
export function mergeSyncedAlerts({ backendAlerts, syncedLocal, seenIds, current, atStart }) {
  const nowById = new Map((current || []).map(a => [a.id, a]));
  const startById = new Map((atStart || []).map(a => [a.id, a]));
  const kept = [...backendAlerts, ...syncedLocal]
    .filter(a => !(startById.has(a.id) && !nowById.has(a.id)))
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
// It was on the screen when the sync started and isn't on it now.
export function deletedSinceStart(id, atStart, current) {
  return (atStart || []).some(a => a.id === id) && !(current || []).some(a => a.id === id);
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
 */
export function loadedAlerts(stored, atStart, current) {
  const list = Array.isArray(stored) ? stored : [];
  if (current === atStart) return list;
  const have = new Set((current || []).map(a => a.id));
  // A stored alert that was on the screen when the load began and is gone
  // now was deleted, or dropped by a sync, while it loaded, so it stays gone.
  return [
    ...(current || []),
    ...list.filter(a => a && !have.has(a.id) && !deletedSinceStart(a.id, atStart, current)),
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
