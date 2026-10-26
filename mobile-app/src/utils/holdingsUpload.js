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
 * guest loses its marks, and each one carries restoredFor with the account's
 * id so the next sync sends it up to that account and no other.
 */
export function asRestoredBy(items, userId) {
  if (!Array.isArray(items)) return items;
  // A backup's lookup and edit marks come off, or the sync would send the
  // backup's copy over a row that may have changed since
  if (userId) return withoutGuestMark(items).map(({ rowLookupFor, editPendingFor, ...item }) => ({ ...item, restoredFor: userId }));
  return items.map(({ restoredFor, rowLookupFor, editPendingFor, ...item }) => asAddedBy(item, false));
}

/**
 * The holdings with a retry mark on each one whose cloud add failed for this
 * account, by local id. That's the restoredFor mark a refused holding takes,
 * so a later sync, which sends up only marked holdings, tries it again
 * instead of replacing the stack with the cloud's copy, which lacks it. A
 * holding with a row, or one marked for another account, isn't marked. The
 * same array comes back when nothing changes.
 */
export function withRetryMarks(items, marks, userId) {
  if (!userId || !marks?.size || !Array.isArray(items)) return items;
  let changed = false;
  const marked = items.map((item) => {
    if (item.supabase_id || item.restoredFor || marks.get(item.id) !== userId) return item;
    changed = true;
    return { ...item, restoredFor: userId };
  });
  return changed ? marked : items;
}

/**
 * The holdings with a lookup mark on each one whose edit couldn't find its
 * row because the lookup failed, by local id. Such a holding takes a retry
 * mark too, since it may have no row, but a sync skips a holding whose local
 * id is already on a row, so the edit would be lost to the cloud's copy. The
 * lookup mark, rowLookupFor with the account's id, has the sync send the edit
 * over that row instead (see rowEditsToSend). Only a holding with this
 * account's retry mark takes it. One carrying a row, as a restored holding
 * does, is found by local id too, since rowEditsToSend reads only this
 * account's rows. The same array comes back when
 * nothing changes.
 */
export function withRowLookups(items, marks, userId) {
  if (!userId || !marks?.size || !Array.isArray(items)) return items;
  let changed = false;
  const marked = items.map((item) => {
    if (marks.get(item.id) !== userId || item.restoredFor !== userId || item.rowLookupFor === userId) return item;
    changed = true;
    return { ...item, rowLookupFor: userId };
  });
  return changed ? marked : items;
}

/**
 * The edits a sync sends over rows it found by local id: each holding with
 * this account's lookup and retry marks whose local id is on a live row of
 * the account, with that row's id. liveRows maps a local id to its row, and
 * leaves out deleted rows, so an edit of a holding deleted elsewhere isn't
 * sent and the cloud's copy drops it. accountRowIds holds every row of the
 * account, deleted ones included.
 */
export function rowEditsToSend(items, liveRows, userId, accountRowIds = new Set()) {
  if (!userId || !liveRows?.size) return [];
  return (items || [])
    .filter((item) => item.rowLookupFor === userId && item.restoredFor === userId && liveRows.has(item.id))
    // A holding on one of this account's rows goes over that row only, so an
    // edit of a row deleted elsewhere never lands on a row sharing its id
    .filter((item) => !accountRowIds.has(item.supabase_id) || liveRows.get(item.id) === item.supabase_id)
    .map((item) => ({ item, rowId: liveRows.get(item.id) }));
}

/**
 * The holdings with an edit mark on each one whose cloud update failed for
 * this account, by local id. marks maps a local id to the row the update
 * was for and its account. The mark puts the row on the holding if it lacks
 * it, and editPendingFor names the account, so
 * the next sync sends the edit before it swaps in the cloud's copy, which
 * lacks it. The guest mark comes off, since the row is this account's. A holding with another row, or a restored one still to go up,
 * isn't marked. The same array comes back when nothing changes.
 */
export function withEditMarks(items, marks, userId) {
  if (!userId || !marks?.size || !Array.isArray(items)) return items;
  let changed = false;
  const marked = items.map((item) => {
    const mark = marks.get(item.id);
    if (!mark || mark.userId !== userId || item.restoredFor) return item;
    if (item.supabase_id && item.supabase_id !== mark.rowId) return item;
    if (item.supabase_id === mark.rowId && item.editPendingFor === userId && !item.addedAsGuest) return item;
    changed = true;
    // A holding on this account's row is never a guest's, so the guest mark
    // comes off, or a copy put back over the row could go up to another account
    const { addedAsGuest, ...rest } = item;
    return { ...rest, supabase_id: mark.rowId, editPendingFor: userId };
  });
  return changed ? marked : items;
}

/**
 * The edit mark a signed-in edit of a holding on this account's row carries
 * from the moment it's saved, so the edit is marked while its update is out.
 * Unmarked, an app killed while the update waits or runs would leave the
 * edit on the phone alone, and the next sync's swap would undo it. A guest's
 * or a restored holding is sent by its own marks, so it takes none. A holding
 * whose add landed this session has no row on it yet, so it takes knownRowId,
 * the row that add went to, with the mark.
 */
export function editMarkAhead(base, userId, knownRowId = null) {
  if (!userId || !base || base.addedAsGuest || base.restoredFor) return {};
  if (base.supabase_id) return { editPendingFor: userId };
  return knownRowId ? { supabase_id: knownRowId, editPendingFor: userId } : {};
}

/**
 * The holdings with the edit mark off the very copy whose update landed. A
 * newer edit of the same holding keeps its own mark, and a copy the sync
 * swapped in carries none. The same array comes back when nothing changes.
 */
export function withoutSentEditMark(items, sent) {
  if (!sent || !Array.isArray(items) || !items.includes(sent)) return items;
  return items.map((item) => {
    if (item !== sent) return item;
    const { editPendingFor, ...rest } = item;
    return rest;
  });
}

/**
 * The edits a sync sends before it fetches the cloud's copy: each holding in
 * lists, one array per metal in HOLDING_METALS order, that carries this
 * account's edit mark and its row, with its metal.
 */
export function pendingEdits(lists, userId) {
  if (!userId || !Array.isArray(lists)) return [];
  return lists.flatMap((items, index) => (items || [])
    .filter((item) => item.editPendingFor === userId && item.supabase_id && !item.restoredFor)
    .map((item) => ({ item, metal: HOLDING_METALS[index] })));
}

/**
 * The cloud's copy with each edit the sync couldn't send put back over its
 * row, mark and all, so the next sync tries it again. The edit goes in its
 * own metal's list, since an edit that moved a holding to another metal finds
 * its row still under the old one, and the next sync reads the metal from
 * the list. An edit whose row is gone from the cloud's copy, as when another
 * device deleted it, is dropped. The same arrays come back when there's
 * nothing to put back, and so does each list the edits don't touch.
 */
export function withPendingEdits(lists, unsent) {
  if (!unsent?.length) return lists;
  const inCloud = new Set(lists.flatMap((items) => items.map((row) => row.supabase_id)));
  const back = unsent.filter(({ item }) => inCloud.has(item.supabase_id));
  if (!back.length) return lists;
  const byRow = new Map(back.map(({ item }) => [item.supabase_id, item]));
  return lists.map((items, index) => {
    const metal = HOLDING_METALS[index];
    const here = back.filter((edit) => edit.metal === metal);
    if (!here.length && !items.some((row) => byRow.has(row.supabase_id))) return items;
    // Each edit takes its row's place when it stays in this metal, and joins
    // the end when it moved here from another
    const placed = new Set();
    const kept = items.flatMap((row) => {
      const edit = byRow.get(row.supabase_id);
      if (!edit) return [row];
      if (here.some((e) => e.item === edit)) {
        placed.add(edit);
        return [edit];
      }
      return [];
    });
    return [...kept, ...here.map((e) => e.item).filter((item) => !placed.has(item))];
  });
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
 * The holdings with the guest mark taken off those in claimed, a set of the
 * holding objects a claim covered, and left on any added since. A guest who
 * adds a holding after a sign out, while the old account's claim is still
 * landing, keeps the mark, so the holding goes up to the next account. The
 * same array comes back when nothing changes.
 */
export function withoutGuestMarkOn(items, claimed) {
  if (!(items || []).some((item) => item.addedAsGuest && claimed.has(item))) return items;
  return items.map((item) => {
    if (!item.addedAsGuest || !claimed.has(item)) return item;
    const { addedAsGuest, ...rest } = item;
    return rest;
  });
}

/**
 * The local holdings a sync may add to this account. On its first sync on
 * this phone a stack with no owner, or this account's own, goes up whole. Of
 * a stack that belongs to another account, and on any later sync, only the
 * holdings added as a guest go up, as when a session expired and someone
 * added to its stack before signing back in, and those this account restored
 * from a backup. A holding restored for another account never goes up, even
 * in a stack with no owner, as when that account's session ended before its
 * first sync claimed the stack.
 */
export function localHoldingsToSync(items, owner, userId, firstSync = true) {
  if (firstSync && mayUploadLocalStack(owner, userId)) {
    return (items || []).filter((item) => !item.restoredFor || item.restoredFor === userId);
  }
  return (items || []).filter((item) => item.addedAsGuest === true
    || (!!userId && item.restoredFor === userId));
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
 * Whether an edit may add a holding that has no row yet to this account. One
 * a guest added may, as may any holding of a stack that's unowned or this
 * account's. One from another account's stack stays out of this one, as
 * after that account's session expired with holdings it never sent up. A
 * restored holding goes to the account that restored it and no other,
 * whoever owns the stack.
 */
export function mayAddEditedHolding(item, owner, userId) {
  if (item?.restoredFor) return item.restoredFor === userId;
  return item?.addedAsGuest === true || mayUploadLocalStack(owner, userId);
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
