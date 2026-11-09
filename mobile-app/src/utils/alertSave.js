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
// current is the list on the screen now. seenIds holds every id the sync read
// from the server or from storage.
export function mergeSyncedAlerts({ backendAlerts, syncedLocal, seenIds, current }) {
  const kept = [...backendAlerts, ...syncedLocal];
  const keptIds = new Set(kept.map(a => a.id));
  const createdSince = (current || []).filter(a => !keptIds.has(a.id) && !seenIds.has(a.id));
  return [...createdSince, ...kept];
}
