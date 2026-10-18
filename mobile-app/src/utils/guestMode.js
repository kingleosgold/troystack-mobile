/**
 * TroyStack - Guest mode, kept on the phone
 *
 * Someone who taps Continue without an account stays a guest across launches,
 * and the holdings they add save on this phone like a signed-in account's do.
 * Signing in turns guest mode off, and a new account's first sync moves those
 * holdings to the cloud. Signing out clears both. Nothing here imports React
 * Native, so it runs under `node --test`.
 */

// 'true' while this phone is in guest mode.
export const GUEST_MODE_KEY = 'stack_guest_mode';

/**
 * Guest mode at launch from what AsyncStorage holds under GUEST_MODE_KEY. A
 * signed-in session wins, so a stale flag never hides an account.
 */
export function guestModeAtLaunch(stored, signedIn) {
  if (signedIn) return false;
  return stored === 'true';
}

/**
 * Whether the holdings may be written to AsyncStorage. Only once the stored
 * holdings have loaded, so an empty first render never overwrites them. A
 * guest's holdings save too.
 */
export function canSaveHoldings({ isAuthenticated, dataLoaded }) {
  return isAuthenticated === true && dataLoaded === true;
}

export const GUEST_SAVE_NOTE = "Saved on this phone only. Create a free account to back it up.";
export const GUEST_BANNER = 'Create a free account to back up your stack';
export const GUEST_CONTINUE = 'Continue without an account';
