/**
 * TroyStack - Guest mode, kept on the phone
 *
 * Someone who taps Continue without an account stays a guest across launches,
 * and the holdings they add save on this phone like a signed-in account's do.
 * Signing in turns guest mode off, and the account's first sync on this phone
 * adds those holdings to it, even one that already has some. Signing out
 * clears both. A fresh install opens as a
 * guest on the Dashboard, so a new user values a stack before any sign-in.
 * Nothing here imports React Native, so it runs under `node --test`.
 */

// 'true' while this phone is in guest mode.
export const GUEST_MODE_KEY = 'stack_guest_mode';

// Written once the first launch is over, by the old tutorial or by opening as a guest.
export const SEEN_FIRST_LAUNCH_KEY = 'stack_has_seen_tutorial';

/**
 * Whether this is the phone's first launch of the app. Neither the guest flag
 * nor the first-launch mark has ever been written, and no holdings are saved.
 * Sign out clears the guest flag but keeps the mark, so a signed-out phone
 * still opens at sign in. 3.0.7 could leave an account's stack with neither
 * written, if its tutorial never closed, and that stack isn't a guest's.
 */
export function isFirstLaunch(storedGuestMode, storedSeenFirstLaunch, hasStoredHoldings = false) {
  return storedGuestMode == null && storedSeenFirstLaunch == null && !hasStoredHoldings;
}

/**
 * Guest mode at launch from what AsyncStorage holds under GUEST_MODE_KEY. A
 * signed-in session wins, so a stale flag never hides an account. A first
 * launch opens as a guest.
 */
export function guestModeAtLaunch(stored, signedIn, firstLaunch = false) {
  if (signedIn) return false;
  return firstLaunch || stored === 'true';
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
// Shown to a guest once they have holdings, so a new user sees their stack first.
export const GUEST_BANNER = 'Create a free account to back up your stack';
export const GUEST_CONTINUE = 'Continue without an account';
