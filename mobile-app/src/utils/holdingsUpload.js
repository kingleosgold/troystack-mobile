/**
 * TroyStack - Which local holdings a sync adds to an account
 *
 * The first time an account syncs on this phone, the holdings already on the
 * phone go up to it, so a guest who signs in keeps their stack even when the
 * account has holdings of its own. The phone records which account its stack
 * belongs to. Of a stack that belongs to another account, and on any later
 * sync, only the holdings added as a guest go up. A holding that is already a
 * row in the cloud never goes up again. Nothing here imports React Native, so
 * it runs under `node --test`.
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
 * account's own over another's. With neither, the stack is a guest's or from
 * before accounts, and the owner is null.
 */
export function stackOwnerOf(recordedOwner, storageKeys, userId) {
  if (recordedOwner) return recordedOwner;
  const synced = (storageKeys || [])
    .filter((key) => typeof key === 'string' && key.startsWith(SYNCED_KEY_PREFIX))
    .map((key) => key.slice(SYNCED_KEY_PREFIX.length));
  if (synced.includes(userId)) return userId;
  return synced[0] || null;
}

// The four metals a holding is filed under.
export const HOLDING_METALS = ['silver', 'gold', 'platinum', 'palladium'];

/**
 * The metal a scanned or imported holding is filed under. Scans name it in
 * any case, and one with no metal or one the app doesn't track goes under
 * silver, as the add sheet does.
 */
export function holdingMetal(metal) {
  const key = typeof metal === 'string' ? metal.trim().toLowerCase() : '';
  return HOLDING_METALS.includes(key) ? key : 'silver';
}

/**
 * A holding added while no account is signed in carries addedAsGuest, so a
 * guest's holdings can be told apart from an account's stack they sit beside,
 * as when a session expired and its stack stayed on the phone.
 */
export function asAddedBy(item, signedIn) {
  return signedIn ? item : { ...item, addedAsGuest: true };
}

/**
 * Holdings restored from iCloud or a backup file. Restored with no account
 * signed in they're the guest's choice of stack, whatever account they came
 * from, so they carry the guest mark like anything else a guest adds.
 * Restored while signed in they're that account's, so a backup made as a
 * guest loses its marks.
 */
export function asRestoredBy(items, signedIn) {
  if (!Array.isArray(items)) return items;
  if (signedIn) return withoutGuestMark(items);
  return items.map((item) => asAddedBy(item, false));
}

/**
 * The holdings with the guest mark taken off, once an account has claimed
 * the stack they're in, so a mark only ever names a holding no account owns.
 * The same array comes back when nothing carries the mark.
 */
export function withoutGuestMark(items) {
  if (!(items || []).some((item) => item.addedAsGuest)) return items;
  return items.map(({ addedAsGuest, ...item }) => item);
}

/**
 * The local holdings a sync may add to this account. On its first sync on
 * this phone a stack with no owner, or this account's own, goes up whole. Of
 * a stack that belongs to another account, and on any later sync, only the
 * holdings added as a guest go up, as when a session expired and someone
 * added to its stack before signing back in.
 */
export function localHoldingsToSync(items, owner, userId, firstSync = true) {
  if (firstSync && mayUploadLocalStack(owner, userId)) return items || [];
  return (items || []).filter((item) => item.addedAsGuest === true);
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
