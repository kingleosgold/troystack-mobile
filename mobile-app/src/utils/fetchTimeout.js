// A time limit on the app's database reads. The Supabase client has none, so
// a sync stuck reading the cloud copy on a stalled connection held every add
// and delete waiting behind it with nothing on screen. With the limit the
// read aborts, the client returns it as an error, the sync fails and its
// retry takes over.
// Nothing here imports React Native, so it runs under `node --test`.

export const REST_TIMEOUT_MS = 30000;

// Only the database's REST reads get the limit.
// Writes are left alone. An aborted insert, update or delete may still land
// on the server, and the app has no queue to retry a single add or delete, so
// cutting one short could drop it from the phone or bring a deleted holding
// back. A big first sync insert can also take longer than any fixed limit.
// Auth calls are left alone too. A token refresh aborted after the server
// rotated the token would leave the phone holding a used refresh token, and
// reusing it can end the session.
const isRestRead = (input, init) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
  return url.includes('/rest/v1/') && (method === 'GET' || method === 'HEAD');
};

export const fetchWithTimeout = (fetchImpl = fetch, timeoutMs = REST_TIMEOUT_MS) =>
  async (input, init = {}) => {
    if (!isRestRead(input, init)) return fetchImpl(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // A caller's own abort still aborts the request.
    const outer = init.signal;
    const forward = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', forward);
    }
    try {
      const res = await fetchImpl(input, { ...init, signal: controller.signal });
      // The body is read inside the limit too. React Native's fetch only
      // answers once the whole body is in, so there this read is instant,
      // but a fetch that streams could stall after the headers. The client
      // reads the body as text either way.
      const body = await res.text();
      // A 204, 205 or 304 answer can't carry a body, even an empty one.
      const empty = [204, 205, 304].includes(res.status);
      return new Response(empty ? null : body, {
        status: res.status, statusText: res.statusText, headers: res.headers,
      });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
  };
