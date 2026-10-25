/**
 * TroyStack - Deletes waiting to reach the account
 *
 * A signed-in delete takes the holding off the phone at once and then marks
 * its row deleted in the cloud. When that write failed, offline say, the
 * holding used to pop back with a notice, so a delete couldn't be made
 * without a connection. Now the delete is kept in a queue on the phone, by
 * account, and the next sync sends it before it fetches the cloud's copy.
 * One the sync still can't send stays queued, and its row is kept out of
 * the cloud's copy so the holding doesn't come back. Like a marked edit, a
 * sign out clears the queue, and asks first. Nothing here imports React
 * Native, so it runs under `node --test`.
 */

export const PENDING_DELETES_KEY = 'stack_pending_deletes';

const METALS = ['silver', 'gold', 'platinum', 'palladium'];

// A queued delete names its account, the holding's local id and metal, and
// its cloud row when the phone knows it. One with no row is found by local
// id when it's sent.
const isEntry = (entry) => !!entry
  && typeof entry.userId === 'string' && !!entry.userId
  && entry.localId != null
  && METALS.includes(entry.metal)
  && (entry.rowId == null || (typeof entry.rowId === 'string' && !!entry.rowId));

const sameDelete = (a, b) => a.userId === b.userId && (
  a.rowId && b.rowId ? a.rowId === b.rowId : a.localId === b.localId && a.metal === b.metal
);

// The queue as stored, or an empty one when nothing or something unreadable
// is there
export function parseDeleteQueue(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

// The queue with this delete in it. A delete already queued for the same row
// or holding takes the row if it lacked one, and isn't queued twice.
export function withQueuedDelete(queue, entry) {
  const next = { userId: entry?.userId, rowId: entry?.rowId || null, localId: entry?.localId, metal: entry?.metal };
  if (!isEntry(next)) return queue;
  const at = queue.findIndex((queued) => sameDelete(queued, next)
    || (queued.userId === next.userId && queued.localId === next.localId && queued.metal === next.metal));
  if (at < 0) return [...queue, next];
  if (queue[at].rowId || !next.rowId) return queue;
  return queue.map((queued, i) => (i === at ? { ...queued, rowId: next.rowId } : queued));
}

// This account's queued deletes
export function deletesFor(queue, userId) {
  if (!userId) return [];
  return (queue || []).filter((entry) => entry.userId === userId);
}

// The queue without the deletes given, matched by account and row, or by
// local id and metal for one with no row
export function withoutDeletes(queue, gone) {
  if (!gone?.length) return queue;
  return queue.filter((entry) => !gone.some((g) => g.userId === entry.userId
    && g.localId === entry.localId && g.metal === entry.metal && (g.rowId || null) === (entry.rowId || null)));
}

// The cloud's copy, one array per metal in METALS order, without the
// holdings this account still has deletes queued for: by row, or by local id
// in its metal for a delete with no row. A list nothing is dropped from comes
// back as the same array.
export function withoutQueuedDeletes(lists, queue, userId) {
  const mine = deletesFor(queue, userId);
  if (!mine.length || !Array.isArray(lists)) return lists;
  const rows = new Set(mine.filter((entry) => entry.rowId).map((entry) => entry.rowId));
  const locals = new Set(mine.filter((entry) => !entry.rowId).map((entry) => `${entry.metal}:${entry.localId}`));
  return lists.map((items, i) => {
    if (!Array.isArray(items)) return items;
    const kept = items.filter((item) => !(item?.supabase_id && rows.has(item.supabase_id))
      && !locals.has(`${METALS[i]}:${item?.id}`));
    return kept.length === items.length ? items : kept;
  });
}

// One queue in storage that every change goes through in turn, so a delete
// queued while a sync takes its sent ones off can't be lost between a read
// and a write. update answers the queue as written, read the queue as it is,
// and clear empties it once the changes before it are done.
// A failed read or write rejects to its caller and doesn't stop the next one.
export function deleteQueueStore(storage, key = PENDING_DELETES_KEY) {
  let chain = Promise.resolve();
  const run = (step) => {
    const next = chain.then(step);
    chain = next.catch(() => {});
    return next;
  };
  return {
    read: () => run(async () => parseDeleteQueue(await storage.getItem(key))),
    update: (change) => run(async () => {
      const queue = parseDeleteQueue(await storage.getItem(key));
      const next = change(queue);
      if (next !== queue) {
        if (next.length) await storage.setItem(key, JSON.stringify(next));
        else await storage.removeItem(key);
      }
      return next;
    }),
    clear: () => run(() => storage.removeItem(key)),
  };
}
