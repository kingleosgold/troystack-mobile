/**
 * TroyStack - Reading every row of a holdings query, not just the first 1000
 *
 * Supabase's API returns at most 1000 rows a request by default, so a select
 * on its own quietly stops there. A stack with more rows, deleted ones
 * included, would lose holdings off the phone after a sync, and the sync's
 * duplicate check would miss rows past 1000 and upload them again.
 *
 * A stack that fits one page is one request, one consistent read. A longer
 * one pages by created_at, then id, each page starting after the last row the
 * one before it saw. The server sets created_at when a row goes in, so a
 * holding another device adds mid-read sorts after every row already there
 * and the read still reaches it, and a delete can't shift the pages. Row ids
 * are random, so paging by id alone would miss a row added below the cursor.
 * Rows with no created_at, if any, are read on their own by id, since a new
 * row always gets one. The paged read runs again, and only two reads in a
 * row that find the same rows count, which also covers an insert still
 * committing as a page went past it. Nothing here imports React Native, so it
 * runs under `node --test`.
 */

// Supabase's default max rows a request. A project set lower would end the
// read early, so this has to stay at or under the project's setting.
export const PAGE_SIZE = 1000;

// Reads past the first before a stack that keeps changing counts as an error
export const MAX_REREADS = 3;

// A PostgREST filter value in double quotes, so a timestamp's + and : are kept
const quoted = (value) => `"${String(value).replace(/["\\]/g, '\\$&')}"`;

// Every row of the query by id, optionally narrowed, the read a lookup uses
async function readById(makeQuery, pageSize, narrow = (q) => q) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = narrow(makeQuery());
    if (lastId != null) query = query.gt('id', lastId);
    const { data, error } = await query.order('id', { ascending: true }).limit(pageSize);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
    lastId = page[page.length - 1].id;
  }
}

// Every row by created_at then id, and then any rows with no created_at
async function readInInsertOrder(makeQuery, pageSize) {
  const rows = [];
  let last = null;
  for (;;) {
    let query = makeQuery().not('created_at', 'is', null);
    if (last) {
      const at = quoted(last.created_at);
      query = query.or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${quoted(last.id)})`);
    }
    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    last = page[page.length - 1];
  }
  const undated = await readById(makeQuery, pageSize, (q) => q.is('created_at', null));
  if (undated.error) return { data: null, error: undated.error };
  rows.push(...undated.data);
  return { data: rows, error: null };
}

const sameIds = (a, b) => a.length === b.length && a.every((row, i) => row.id === b[i].id);

/**
 * Reads every row of a query. makeQuery() builds a fresh filtered query each
 * call, selecting id and created_at, and fetchAllRows adds the cursor, the
 * order and the limit and awaits it. Resolves to { data, error }, the way a
 * single select does. On an error data is null, so a caller never mistakes
 * part of a stack for all of it.
 *
 * A stack that fits one page comes back from that one request. A longer one
 * is read in insert order twice, and when two reads in a row find the same
 * rows the second's values count. A stack another device keeps changing
 * through MAX_REREADS more reads returns an error, so the caller keeps the
 * phone's stack and tries again later.
 *
 * A lookup of a row that was already there passes { settle: false } and
 * reads by id once. One read never skips a row that exists the whole time,
 * and an error would read as not found.
 */
export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE, { settle = true } = {}) {
  if (!settle) return readById(makeQuery, pageSize);
  const first = await makeQuery().order('id', { ascending: true }).limit(pageSize);
  if (first.error) return { data: null, error: first.error };
  if ((first.data || []).length < pageSize) return { data: first.data || [], error: null };
  let read = await readInInsertOrder(makeQuery, pageSize);
  if (read.error) return { data: null, error: read.error };
  for (let i = 0; i < MAX_REREADS; i++) {
    const again = await readInInsertOrder(makeQuery, pageSize);
    if (again.error) return { data: null, error: again.error };
    if (sameIds(read.data, again.data)) return { data: again.data, error: null };
    read = again;
  }
  return { data: null, error: new Error('Holdings kept changing while they were read') };
}

/**
 * Newest first by created_at, then by id, the order the stack had when it
 * was read in one request. Returns a new array.
 */
export function newestFirst(rows) {
  return [...rows].sort((a, b) => {
    const ac = a.created_at || '';
    const bc = b.created_at || '';
    if (ac !== bc) return ac < bc ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
