/**
 * TroyStack - Changes a sign out would clear before they reach the account
 *
 * A signed-in add or edit whose cloud write failed stays on the phone with a
 * mark, and the next sync sends it up. Sign out clears the phone's stack, so
 * a marked holding would be gone with no copy in the account. Sign out counts
 * them first and asks. Nothing here imports React Native, so it runs under
 * `node --test`.
 */

import { localHoldingsToSync, pendingEdits } from './holdingsUpload.js';

// How many holdings in lists, one array per metal, the next sync would still
// send to this account: adds marked for it or added as a guest, and edits
// marked for their row
export function unsentCount(lists, userId) {
  if (!userId || !Array.isArray(lists)) return 0;
  const adds = lists.reduce((n, items) => n + localHoldingsToSync(items, null, userId, false).length, 0);
  return adds + pendingEdits(lists, userId).length;
}

// The words for the ask
export function unsentSignOutAlert(count) {
  const what = count === 1 ? '1 change on this phone hasn\'t' : `${count} changes on this phone haven't`;
  return {
    title: 'Not saved to your account yet',
    message: `${what} reached your account. Signing out now clears ${count === 1 ? 'it' : 'them'} from this phone. Send ${count === 1 ? 'it' : 'them'} first, or sign out anyway.`,
  };
}
