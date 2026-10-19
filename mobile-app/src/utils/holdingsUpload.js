/**
 * TroyStack - Which local holdings an account's first sync adds to it
 *
 * The first time an account syncs on this phone, the holdings already on the
 * phone go up to it, so a guest who signs in keeps their stack even when the
 * account has holdings of its own. The phone records which account its stack
 * belongs to, and a stack that belongs to another account never goes up. A
 * holding that is already a row in the cloud never goes up again. Nothing
 * here imports React Native, so it runs under `node --test`.
 */

// The Supabase user id whose stack is on this phone. An account claims it
// when it starts syncing a stack with no owner, and sign out clears it.
export const HOLDINGS_OWNER_KEY = 'stack_holdings_owner';

// Written after an account's first sync on this phone, on every build.
export const SYNCED_KEY_PREFIX = 'stack_synced_';

/**
 * Who the phone's stack belongs to. The recorded owner if there is one.
 * Builds before the owner was recorded only wrote stack_synced_<user id>, so
 * a key left on the phone names the account whose stack it is, this
 * account's own over another's. But 3.0.7's sign out left other accounts'
 * keys behind, so a key doesn't count for a guest's stack, which 3.0.7 never
 * had a signed-in stack become, since sign in and sign out cleared the guest
 * flag. With neither, the stack is a guest's or from before accounts, and the
 * owner is null.
 */
export function stackOwnerOf(recordedOwner, storageKeys, userId, guestStack = false) {
  if (recordedOwner) return recordedOwner;
  if (guestStack) return null;
  const synced = (storageKeys || [])
    .filter((key) => typeof key === 'string' && key.startsWith(SYNCED_KEY_PREFIX))
    .map((key) => key.slice(SYNCED_KEY_PREFIX.length));
  if (synced.includes(userId)) return userId;
  return synced[0] || null;
}

/**
 * The stack_synced_ keys among storageKeys, all of them, or all but this
 * account's. A key left by a session that ended without a sign out outlives
 * its stack once another account syncs or signs out, and would then block a
 * guest's, so sign out clears them all and a sync clears the others.
 */
export function syncedKeys(storageKeys, exceptUserId = null) {
  return (storageKeys || []).filter((key) => typeof key === 'string'
    && key.startsWith(SYNCED_KEY_PREFIX)
    && key !== `${SYNCED_KEY_PREFIX}${exceptUserId}`);
}

/**
 * Whether the phone's stack may go up to this account. A stack with no owner
 * is a guest's or from before accounts. One owned by this account is its own.
 * One owned by another account stays out of this one, as after a session
 * that ended without a sign out.
 */
export function mayUploadLocalStack(owner, userId) {
  return !owner || owner === userId;
}

/**
 * The holdings to insert. One whose supabase_id is a row of this account,
 * deleted or not, is skipped, even when that row never had a local id. So is
 * one whose local id is on a row of this account, deleted or not. A
 * supabase_id from another account, as in a backup restored on this phone,
 * doesn't stop the upload.
 */
export function holdingsToUpload(items, existingLocalIds, existingRowIds = new Set()) {
  return (items || []).filter((item) => !existingRowIds.has(item.supabase_id) && !existingLocalIds.has(item.id));
}
