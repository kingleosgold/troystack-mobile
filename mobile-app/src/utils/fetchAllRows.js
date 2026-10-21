/**
 * TroyStack - Reading every row of a holdings query, not just the first 1000
 *
 * Supabase's API returns at most 1000 rows a request by default, so a select
 * on its own quietly stops there. A stack with more rows, deleted ones
 * included, would lose holdings off the phone after a sync, and the sync's
 * duplicate check would miss rows past 1000 and upload them again. So the
 * reads page through by row id, each page starting after the last id the one
 * before it saw, until a page comes back short. Paging by id rather than by
 * offset means a holding another device adds or deletes mid-read can't shift
 * the pages, so no row already there is skipped or read twice. Row ids aren't
 * in insert order though, so a row added mid-read below the cursor would be
 * missed. A read that took more than one page runs again, and only two reads
 * in a row that find the same ids count. Nothing here
 * imports React Native, so it runs under `node --test`.
 */

// Supabase's default max rows a request. A project set lower would end the
// read early, so this has to stay at or under the project's setting.
export const PAGE_SIZE = 1000;

// Reads past the first before a stack that keeps changing counts as an error
export const MAX_REREADS = 3;

async function readOnce(makeQuery, pageSize) {
  const rows = [];
  let lastId = null;
  for (;;) {
    let query = makeQuery();
    if (lastId != null) query = query.gt('id', lastId);
    const { data, error } = await query.order('id', { ascending: true }).limit(pageSize);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
    lastId = page[page.length - 1].id;
  }
}

const sameIds = (a, b) => a.length === b.length && a.every((row, i) => row.id === b[i].id);

/**
 * Reads every row of a query, in id order. makeQuery() builds a fresh
 * filtered query each call, selecting id, and fetchAllRows adds the id cursor,
 * the order and the limit and awaits it. Resolves to { data, error }, the way
 * a single select does. On an error data is null, so a caller never mistakes
 * part of a stack for all of it.
 *
 * A stack that fits one page is one consistent read. A longer one is read
 * again, and when two reads in a row find the same ids, the first held every
 * row that was there when it finished, and the second's values are newer. A
 * stack another device keeps changing through MAX_REREADS more reads returns
 * an error, so the caller keeps the phone's stack and tries again later.
 *
 * A lookup of a row that was already there passes { settle: false }. One read
 * never skips a row that exists the whole time, and an error would read as
 * not found.
 */
export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE, { settle = true } = {}) {
  let read = await readOnce(makeQuery, pageSize);
  if (!settle || read.error || read.data.length < pageSize) return { data: read.data, error: read.error };
  for (let i = 0; i < MAX_REREADS; i++) {
    const again = await readOnce(makeQuery, pageSize);
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
