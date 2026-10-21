/**
 * TroyStack - Inserting a sync's holdings so one bad row can't hold back the rest
 *
 * A sync sends its new holdings up in one insert. Postgres refuses the whole
 * batch when one row breaks a rule, say a number too big for its column, and
 * that row would then fail every later sync and keep the cloud's copy off the
 * phone. So when the database refuses the batch over its data, the batch is
 * halved until the rows it refuses stand alone, and those come back to stay on
 * the phone. Any
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
 * them all at once, then halves a batch the database refused over its data
 * until each refused row stands alone, so one bad row among many costs a few
 * requests rather than one per row. Resolves to { insertedCount, rejected,
 * error }, where rejected holds the indexes of the rows the database refused,
 * in order. error is set when anything else went wrong, and rows inserted
 * before it stay inserted.
 */
export async function insertRows(rows, insert) {
  const result = { insertedCount: 0, rejected: [], error: null };
  if (rows.length) await insertRange(rows, 0, rows.length, insert, result);
  return result;
}

async function insertRange(rows, from, to, insert, result) {
  const { error } = await insert(rows.slice(from, to));
  if (!error) {
    result.insertedCount += to - from;
  } else if (!isRowRejection(error)) {
    result.error = error;
  } else if (to - from === 1) {
    result.rejected.push(from);
  } else {
    const mid = from + Math.ceil((to - from) / 2);
    await insertRange(rows, from, mid, insert, result);
    if (!result.error) await insertRange(rows, mid, to, insert, result);
  }
}

/**
 * The alert after a sync the database refused holdings in, naming them so
 * the user knows which ones to check. Names past the third are counted.
 */
export function refusedHoldingsAlert(names) {
  const named = names.map((name) => (typeof name === 'string' && name.trim() ? name.trim() : 'A holding'));
  const title = named.length === 1
    ? `${named[0]} didn't save to your account`
    : `${named.length} holdings didn't save to your account`;
  const listed = named.length === 1 ? '' : `${named.slice(0, 3).join(', ')}${named.length > 3 ? ` and ${named.length - 3} more` : ''}. `;
  return {
    title,
    message: `${listed}They're still on this phone. Check their numbers and save them again, and the next sync sends them up.`,
  };
}
