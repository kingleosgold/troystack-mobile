// A failed holdings sync tries again on its own. Before this only pull to
// refresh did, so a sign in on a bad connection left a guest's stack on the
// phone alone until the person thought to pull. The tries are few and spaced
// out, so an account the server keeps refusing doesn't retry in a loop.
// Nothing here imports React Native, so it runs under `node --test`.

export const SYNC_RETRY_DELAYS_MS = [5000, 30000, 120000];

// How long to wait before the next try, or null once the tries are used up.
export const syncRetryDelay = (triesSoFar) => (
  Number.isInteger(triesSoFar) && triesSoFar >= 0 && triesSoFar < SYNC_RETRY_DELAYS_MS.length
    ? SYNC_RETRY_DELAYS_MS[triesSoFar]
    : null
);

// Whether a try is due at all. Only a signed-in account whose stack hasn't
// synced this session needs one, and only while the app is on screen.
export const syncRetryDue = ({ signedIn, syncError, hasSyncedOnce, appActive }) => (
  !!signedIn && !!syncError && !hasSyncedOnce && !!appActive
);
