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
// send to this account, as the sync itself picks them: on its first sync the
// whole stack if it's this account's or no one's, else adds marked for it or
// added as a guest, then edits marked for their row. A holding already on a
// row goes up as no new row, so it isn't counted as an add. inFlight counts
// writes still on their way, whose failure a sign out would drop unmarked.
export function unsentCount(lists, userId, { owner = null, firstSync = false, inFlight = 0 } = {}) {
  if (!userId || !Array.isArray(lists)) return 0;
  const adds = lists.reduce((n, items) => n + localHoldingsToSync(items, owner, userId, firstSync)
    .filter((item) => !item.supabase_id).length, 0);
  return adds + pendingEdits(lists, userId).length + Math.max(0, inFlight || 0);
}

// The words for the ask
export function unsentSignOutAlert(count) {
  const what = count === 1 ? '1 change on this phone hasn\'t' : `${count} changes on this phone haven't`;
  return {
    title: 'Not saved to your account yet',
    message: `${what} reached your account. Signing out now clears ${count === 1 ? 'it' : 'them'} from this phone. Send ${count === 1 ? 'it' : 'them'} first, or sign out anyway.`,
  };
}
