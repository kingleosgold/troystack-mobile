// A time limit on the app's database requests. The Supabase client has none,
// and React Native's fetch can wait on a stalled connection for a long time,
// so a sync stuck on one request held every add and delete waiting behind it
// with nothing on screen. With the limit the request aborts, the client
// returns it as an error, and the sync's retry takes over.
// Nothing here imports React Native, so it runs under `node --test`.

export const REST_TIMEOUT_MS = 30000;

// Only the database's REST calls get the limit. Auth calls are left alone: a
// token refresh aborted after the server rotated the token would leave the
// phone holding a used refresh token, and reusing it can end the session.
const isRestRequest = (input) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);
  return url.includes('/rest/v1/');
};

export const fetchWithTimeout = (fetchImpl = fetch, timeoutMs = REST_TIMEOUT_MS) =>
  (input, init = {}) => {
    if (!isRestRequest(input)) return fetchImpl(input, init);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // A caller's own abort still aborts the request.
    const outer = init.signal;
    const forward = () => controller.abort();
    if (outer) {
      if (outer.aborted) controller.abort();
      else outer.addEventListener('abort', forward);
    }
    const done = () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    };
    return fetchImpl(input, { ...init, signal: controller.signal }).then(
      (res) => { done(); return res; },
      (err) => { done(); throw err; },
    );
  };
