/**
 * TroyStack - Local ids for cloud rows that carry none
 *
 * A holding's local id rides in its row's notes as local_id. A row written
 * without one, from troystack.ai or an old build, used to get Date.now() as
 * its id, so two such rows in one fetch could share an id and a delete or an
 * edit on one could match both. Each row with no local_id now gets an id of
 * its own, counted up from now and past any id a row in the same fetch
 * already carries. Nothing here imports React Native, so it runs under
 * `node --test`.
 */

// The ids for one fetch's rows, in order. `localIds` holds each row's
// local_id, or a falsy value for a row with none.
export function idsForFetch(localIds, now) {
  const taken = new Set((localIds || []).filter(Boolean));
  let next = now;
  return (localIds || []).map((localId) => {
    if (localId) return localId;
    while (taken.has(next)) next += 1;
    taken.add(next);
    return next;
  });
}
