/**
 * TroyStack - Inserting a sync's holdings so one bad row can't hold back the rest
 *
 * A sync sends its new holdings up in one insert. Postgres refuses the whole
 * batch when one row breaks a rule, say a number too big for its column, and
 * that row would then fail every later sync and keep the cloud's copy off the
 * phone. So when the database refuses the batch over its data, the batch is
 * split in half and each half tried again, down to single rows, and the rows
 * it refuses come back to stay on the phone. One bad row in a large stack
 * costs a few requests rather than one per row. Any other failure, a dropped
 * connection or a refused session, fails the sync as before, so nothing is
 * dropped. Nothing here imports React Native, so it runs under `node --test`.
 */

/**
 * Whether the database refused a row over its data. Postgres puts data
 * exceptions in class 22 and integrity constraint breaks in class 23.
 * Network errors carry no code, and a refused session or row-level security
 * carries another class. A foreign key break (23503) can only come from the
 * row's user_id, as when the account was deleted on another device, so it
 * fails the sync rather than every row.
 */
export function isRowRejection(error) {
  return typeof error?.code === 'string' && /^2[23]/.test(error.code) && error.code !== '23503';
}

/**
 * Inserts rows through insert(batch), which resolves to { error }. Tries
 * them all at once, then halves of a batch the database refused over its
 * data until the refused rows stand alone. Resolves to { insertedCount,
 * rejected, error }, where rejected holds the indexes of the rows the
 * database refused, in order. error is set when anything else went wrong,
 * and rows inserted before it stay inserted.
 */
export async function insertRows(rows, insert) {
  if (!rows.length) return { insertedCount: 0, rejected: [], error: null };
  const { error: batchError } = await insert(rows);
  if (!batchError) return { insertedCount: rows.length, rejected: [], error: null };
  if (!isRowRejection(batchError)) return { insertedCount: 0, rejected: [], error: batchError };

  const result = { insertedCount: 0, rejected: [], error: null };
  await splitRefused(rows, 0, insert, result);
  return result;
}

// Tries each half of a batch the database refused. A half it takes is
// counted, a lone row it refuses is rejected and a larger refused half is
// split again. Stops at the first error that isn't a refusal.
async function splitRefused(rows, start, insert, result) {
  if (rows.length === 1) {
    result.rejected.push(start);
    return;
  }
  const mid = Math.floor(rows.length / 2);
  for (const [half, offset] of [[rows.slice(0, mid), start], [rows.slice(mid), start + mid]]) {
    const { error } = await insert(half);
    if (!error) result.insertedCount += half.length;
    else if (!isRowRejection(error)) result.error = error;
    else await splitRefused(half, offset, insert, result);
    if (result.error) return;
  }
}
