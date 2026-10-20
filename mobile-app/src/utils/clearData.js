/**
 * TroyStack - Clear All Data's words
 *
 * Clear All Data erases this phone. A signed-in account's holdings stay in
 * the cloud, so the wipe signs that account out first rather than let the
 * next sync bring them straight back, and the words say so.
 */

export function clearDataPrompt(signedIn) {
  return signedIn
    ? "Are you sure? This erases all your holdings and settings on this phone and signs you out. Your account's cloud copy stays."
    : 'Are you sure? This will permanently delete all your holdings and settings.';
}

export function clearDataDone(signedIn) {
  return signedIn
    ? "All your data on this phone has been erased and you've been signed out."
    : 'All your data has been erased. The app has been reset to its initial state.';
}
