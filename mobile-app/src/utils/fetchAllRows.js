/**
 * TroyStack - Reading every row of a holdings query, not just the first 1000
 *
 * Supabase's API returns at most 1000 rows a request by default, so a select
 * on its own quietly stops there. A stack with more rows, deleted ones
 * included, would lose holdings off the phone after a sync, and the sync's
 * duplicate check would miss rows past 1000 and upload them again. So the
 * reads page through with .range() until a page comes back short. Nothing
 * here imports React Native, so it runs under `node --test`.
 */

// Supabase's default max rows a request. A project set lower would end the
// read early, so this has to stay at or under the project's setting.
export const PAGE_SIZE = 1000;

/**
 * Reads every row of a query. makeQuery() builds a fresh query with a stable
 * order each call, and fetchAllRows adds .range(from, to) and awaits it.
 * Resolves to { data, error }, the way a single select does. On an error
 * data is null, so a caller never mistakes part of a stack for all of it.
 */
export async function fetchAllRows(makeQuery, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
