/**
 * TroyStack - Inserting a sync's holdings so one bad row can't hold back the rest
 *
 * A sync sends its new holdings up in one insert. Postgres refuses the whole
 * batch when one row breaks a rule, say a number too big for its column, and
 * that row would then fail every later sync and keep the cloud's copy off the
 * phone. So when the database refuses the batch over its data, each row goes
 * up on its own and the ones it refuses come back to stay on the phone. Any
 * other failure, a dropped connection or a refused session, fails the sync as
 * before, so nothing is dropped. Nothing here imports React Native, so it
 * runs under `node --test`.
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
 * them all at once, then one at a time if the database refused the batch
 * over its data. Resolves to { insertedCount, rejected, error }, where
 * rejected holds the indexes of the rows the database refused. error is set
 * when anything else went wrong, and rows inserted before it stay inserted.
 */
export async function insertRows(rows, insert) {
  if (!rows.length) return { insertedCount: 0, rejected: [], error: null };
  const { error: batchError } = await insert(rows);
  if (!batchError) return { insertedCount: rows.length, rejected: [], error: null };
  if (!isRowRejection(batchError)) return { insertedCount: 0, rejected: [], error: batchError };

  let insertedCount = 0;
  const rejected = [];
  for (let i = 0; i < rows.length; i += 1) {
    const { error } = await insert([rows[i]]);
    if (!error) insertedCount += 1;
    else if (isRowRejection(error)) rejected.push(i);
    else return { insertedCount, rejected, error };
  }
  return { insertedCount, rejected, error: null };
}
