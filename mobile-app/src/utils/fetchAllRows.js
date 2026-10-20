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
 * the pages, so no row already there is skipped or read twice. Nothing here
 * imports React Native, so it runs under `node --test`.
 */

// Supabase's default max rows a request. A project set lower would end the
// read early, so this has to stay at or under the project's setting.
export const PAGE_SIZE = 1000;

/**
 * Reads every row of a query, in id order. makeQuery() builds a fresh
 * filtered query each call, selecting id, and fetchAllRows adds the id cursor,
 * the order and the limit and awaits it. Resolves to { data, error }, the way
 * a single select does. On an error data is null, so a caller never mistakes
 * part of a stack for all of it.
 */
export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE) {
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
