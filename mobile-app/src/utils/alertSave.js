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
