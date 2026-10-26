/**
 * TroyStack - Local ids for cloud rows that carry none
 *
 * A holding's local id rides in its row's notes as local_id. A row written
 * without one, from troystack.ai or an old build, used to get Date.now() as
 * its id, so two such rows in one fetch could share an id and a delete or an
 * edit on one could match both. An old build that edited two of them then
 * wrote that shared id back to both rows. Now each row with no local_id, and
 * each row after the first to repeat one, gets an id hashed from its cloud
 * row's id. That id is the same at every fetch, so a queued delete or an edit
 * made under it still finds its row after the next fetch. It sits in a range
 * no Date.now() id reaches, and a clash in one fetch counts up to a free id.
 * Nothing here imports React Native, so it runs under `node --test`.
 */

// Hashed ids run from here to just under 9e15, all safe integers. Date.now()
// ids won't reach 8e15 for over 250,000 years.
export const HASHED_ID_BASE = 8e15;
// The high part stays under this so the high and low parts together stay
// under 1e15
const HIGH_SPAN = 232830;
const LOW_SPAN = 4294967296;

// 32-bit FNV-1a over a string, from a given seed
function fnv1a(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// The id for a cloud row with no usable local_id, from that row's id
export function hashedIdFor(rowId) {
  const text = String(rowId ?? '');
  const high = fnv1a(text, 2166136261) % HIGH_SPAN;
  const low = fnv1a(text, 3735928559);
  return HASHED_ID_BASE + high * LOW_SPAN + low;
}

// The ids for one fetch's rows, in order. `localIds` holds each row's
// local_id, or a falsy value for a row with none. `rowIds` holds each row's
// cloud id, in the same order.
export function idsForFetch(localIds, rowIds) {
  const list = localIds || [];
  const taken = new Set(list.filter(Boolean));
  const kept = new Set();
  return list.map((localId, i) => {
    if (localId && !kept.has(localId)) {
      kept.add(localId);
      return localId;
    }
    let next = hashedIdFor((rowIds || [])[i]);
    while (taken.has(next)) next += 1;
    taken.add(next);
    return next;
  });
}

// The live rows by the id a fetch gives each one, for a sync to find the row
// under a holding's id. Pass the rows a fetch reads, in its order, so a row
// with no local_id, or one repeating another row's, maps under the same
// hashed id its holding carries.
export function rowsByFetchId(localIds, rowIds) {
  const ids = idsForFetch(localIds, rowIds);
  return new Map(ids.map((id, i) => [id, rowIds[i]]));
}

// The row a holding's id names, from the live rows a fetch reads, in its
// order, and each row's local_id. A row with no local_id, or one repeating
// another row's, is found under the hashed id its holding carries. Null when
// no row carries that id.
export function rowForFetchId(rows, localIds, id) {
  const list = rows || [];
  const i = idsForFetch(localIds, list.map((row) => row.id)).indexOf(id);
  return i === -1 ? null : list[i];
}

// Every id a holding of these rows could carry: each row's local_id and each
// row's hashed id. `localIds` holds each row's local_id, or a falsy value for
// a row with none, and `rowIds` each row's cloud id, in the same order.
export function idsTakenBy(localIds, rowIds) {
  const ids = new Set();
  (rowIds || []).forEach((rowId, i) => {
    const localId = (localIds || [])[i];
    if (localId) ids.add(localId);
    ids.add(hashedIdFor(rowId));
  });
  return ids;
}
