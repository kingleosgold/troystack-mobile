/**
 * TroyStack - Opening a dealer link
 *
 * Compare Dealers and Troy's Shop on dealer card open affiliate links in the
 * browser. Linking.openURL rejects when nothing can open a URL, and an
 * unhandled rejection there shows a red box in a dev build and nothing at all
 * on a phone, so the tap just dies. Troy's card also takes its URLs from the
 * API, so only an http or https link is opened from there. Either miss tells
 * the user once instead of failing silently. Nothing here imports React
 * Native, so it runs under `node --test`.
 */

export const DEALER_LINK_FAILED = {
  title: "Couldn't open the dealer",
  message: "The dealer's page couldn't be opened right now.",
};

/** True for an http or https URL with a host, the only kind a dealer link opens. */
export function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(url.trim());
}

/**
 * Opens url with openURL (Linking.openURL in the app) and calls onFail when the
 * URL isn't a web link or the open fails. Never rejects, even when onFail
 * throws. Resolves true when the link opened and false when it didn't.
 */
export function openDealerLink(url, openURL, onFail) {
  // A notice that can't be shown leaves the tap where it was, but never as an
  // unhandled rejection
  const fail = () => {
    try {
      onFail();
    } catch (e) {
      // Nothing more to tell the user, but a dev build says why the notice
      // didn't show. __DEV__ only exists under React Native.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('[dealerLink] the failed-link notice threw', e);
      }
    }
    return false;
  };
  if (!isWebUrl(url)) return Promise.resolve(fail());
  return Promise.resolve()
    .then(() => openURL(url.trim()))
    .then(() => true, fail);
}

/**
 * Wraps show so a burst of failed taps puts up one notice, not a stack of
 * them. show gets a dismiss callback to call when the user closes the notice.
 * Until then, or until staleMs passes in case dismiss never fires, further
 * calls are dropped. Each notice's dismiss clears only its own gate, so one
 * that fires late, after staleMs let a newer notice up, doesn't open the gate
 * under it. Returns true when the notice was shown.
 */
export function onceUntilDismissed(show, { now = Date.now, staleMs = 10000 } = {}) {
  let shownAt = null;
  let current = 0;
  return () => {
    const t = now();
    if (shownAt !== null && t - shownAt < staleMs) return false;
    shownAt = t;
    current += 1;
    const mine = current;
    const dismiss = () => {
      if (mine === current) shownAt = null;
    };
    try {
      show(dismiss);
    } catch (e) {
      shownAt = null;
      throw e;
    }
    return true;
  };
}
