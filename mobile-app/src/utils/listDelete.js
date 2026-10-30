/**
 * TroyStack - A signed-in delete from the list, sent to the account
 *
 * The holding is already off the phone when this runs. The delete is queued
 * before it's sent, so an app closed mid-request leaves it for the next sync
 * rather than lose it, and comes off the queue once its row is gone. One that
 * can't reach the account stays queued for the sync, and only when the queue
 * can't hold it does the holding go back with a notice. Pulled out of App.js
 * so its order is tested by behaviour. Nothing here imports React Native, so
 * it runs under `node --test`.
 */

import { withQueuedDelete, withoutDeleteOf } from './deleteQueue.js';

/**
 * Sends one delete. Everything it touches comes in:
 * - entry: { userId, rowId, localId, metal }, rowId the holding's
 *   supabase_id when it has one
 * - pendingDeletes: the deleteQueueStore
 * - sendingSet, rowlessSet: read the current marks sets, since a sign out
 *   swaps them for new ones
 * - sameAccount: false once the account changed or the queue was cleared
 *   since the delete started
 * - isLatest: true while no later delete of the same holding has started
 * - earlierWrites: for a holding with no row, the writes started before it,
 *   answering true once they settled in time
 * - knownRow: the row its add went to if that landed this session
 * - findRow: finds the row by local id, or null, and throws when it can't look
 * - deleteRow: deletes a row, answering { error }
 * - noteQueued: the notice a change saved on this phone only gets
 * - putBack: puts the holding back with a notice, once the queue couldn't
 *   hold it and the same account still holds the stack
 * - warn: logs a failure, a no-op by default
 *
 * Answers 'deleted', 'rowless', 'queued', 'restored' or 'left', for tests.
 */
export async function sendListDelete({
  entry: start,
  pendingDeletes,
  sendingSet,
  rowlessSet,
  sameAccount,
  isLatest,
  earlierWrites = null,
  knownRow,
  findRow,
  deleteRow,
  noteQueued,
  putBack,
  warn = () => {},
}) {
  const { userId, localId, metal } = start;
  // deleteRow answers its error rather than throwing, and a lookup that
  // fails throws, since a row may still be there
  let reached = true;
  // The row the delete went to, when it's known
  let rowId = start.rowId || null;
  const hadRow = !!rowId;
  const entry = { userId, rowId, localId, metal };
  // Set when the lookup finds no row, so the holding may still be in the
  // stack on disk
  let rowless = false;
  // Sending it twice is harmless, since a deleted row stays deleted and
  // isn't found by local id. A sign out or account change since has cleared
  // the queue, so it isn't written back under it. A queue that can't be
  // saved still sends. Its mark goes on the set of the queue it joins, taken
  // now since a sign out while the queue write waits swaps the set
  const sending = sendingSet();
  let queuedFirst = false;
  if (sameAccount()) {
    try {
      await pendingDeletes.update((queue) => withQueuedDelete(queue, entry));
      queuedFirst = true;
    } catch (err) {
      warn('Failed to queue the delete:', err);
    }
  }
  if (queuedFirst) sending.add(entry);
  // A holding deleted again, as after a restore brought it back, is counted
  // afresh rather than as the one that found no row. Only a delete that
  // joined this queue does that. One that didn't, as after a sign out and
  // back in, leaves the queued delete and its mark as they are, or the
  // unsent count would take it for one still to send.
  const dropRowlessMarks = () => {
    const marks = rowlessSet();
    for (const done of marks) {
      if (done.userId === userId && done.localId === localId && done.metal === metal) {
        marks.delete(done);
      }
    }
  };
  if (queuedFirst) dropRowlessMarks();
  try {
    try {
      if (hadRow) {
        const { error } = await deleteRow(rowId);
        if (error) reached = false;
      } else if (!(await earlierWrites) && !knownRow()) {
        // A write before it still out may yet make this holding's row, so a
        // lookup now could miss it and the row would come back. The delete
        // is queued below for the sync to find. One whose add landed this
        // session has its row.
        reached = false;
      } else {
        // By the row its add went to if it landed this session, else find
        // it in the account by local id
        const known = knownRow();
        const existing = known ? { id: known } : await findRow(localId, metal);
        if (existing) {
          rowId = existing.id;
          const { error } = await deleteRow(rowId);
          if (error) reached = false;
        } else {
          rowless = true;
        }
      }
    } catch (err) {
      warn('Failed to delete holding from Supabase:', err);
      reached = false;
    }
    if (reached) {
      // Off the queue once it's landed. One that can't be taken off is sent
      // again by the next sync, which does no harm. One that found no row
      // stays for the sync, which takes it off once the stack without its
      // holding is stored, or a kill before the save effect lands would
      // upload it again. A sign out since cleared the queue it was in, so it
      // touches nothing a delete queued after it may have left.
      if (!sameAccount()) return 'left';
      if (queuedFirst && rowless && isLatest()) rowlessSet().add(entry);
      if (queuedFirst && !rowless) {
        await pendingDeletes.update((queue) => withoutDeleteOf(queue, entry))
          .catch((err) => warn('Failed to unqueue the delete:', err));
      }
      return rowless ? 'rowless' : 'deleted';
    }
    // The row is still live, so the next sync would bring the holding back.
    // The delete stays queued for the next sync to send, taking the row if
    // one was found since, and the holding stays off the phone, with the
    // notice a change saved on this phone only gets. With no row known, as
    // when a write before it was still out, the sync finds it by local id
    // once those writes land. A sign out or account change since has cleared
    // the queue, so the delete isn't written back under it.
    if (!sameAccount()) return 'left';
    let queued = queuedFirst;
    try {
      await pendingDeletes.update((queue) => withQueuedDelete(queue, { ...entry, rowId }));
      queued = true;
      // One that only joined the queue now clears an earlier mark here, or
      // Sign Out would count it as settled
      if (!queuedFirst) dropRowlessMarks();
    } catch (err) {
      warn('Failed to queue the delete:', err);
    }
    if (queued) {
      noteQueued();
      return 'queued';
    }
    // A queue that couldn't be saved can't hold it, so the holding goes back
    // now with a notice, while the same account holds the same stack. After
    // a swap the stack came from the cloud, which still has it.
    if (sameAccount()) putBack();
    return 'restored';
  } finally {
    if (queuedFirst) sending.delete(entry);
  }
}
