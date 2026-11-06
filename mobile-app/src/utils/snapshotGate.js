// The daily portfolio snapshot posts one account's totals under that
// account's id. It waits until this account's own cloud stack has landed,
// so a sign in never posts the empty or previous stack, and it remembers the
// day per account, so a second account on the same phone still gets its own.
// Nothing here imports React Native, so it runs under `node --test`.

export const SNAPSHOT_DATE_PREFIX = 'lastSnapshotDate_';
// The one key per phone that builds before this one wrote
export const LEGACY_SNAPSHOT_DATE_KEY = 'lastSnapshotDate';

// Where the day of this account's last snapshot is kept
export const snapshotDateKey = (userId) => `${SNAPSHOT_DATE_PREFIX}${userId}`;

// Every snapshot day key among storageKeys, the old per phone one included
export function snapshotDateKeys(storageKeys) {
  return (storageKeys || []).filter((key) => typeof key === 'string'
    && (key === LEGACY_SNAPSHOT_DATE_KEY || key.startsWith(SNAPSHOT_DATE_PREFIX)));
}

// Whether a snapshot may post for userId now. syncedUserId is the account
// whose cloud stack the last finished sync read. An account switch that
// never passes through a signed-out user leaves hasSyncedOnce true from the
// last account for a render, and its id is what tells the two apart.
export function shouldSnapshot({ dataLoaded, spotPricesLive, hasSyncedOnce, syncedUserId, userId, hasGold }) {
  return !!dataLoaded
    && !!spotPricesLive
    && !!hasSyncedOnce
    && !!userId
    && syncedUserId === userId
    && !!hasGold;
}

// One snapshot save per account at a time. The save effect and the analytics
// fetch can both start one in the same moment, and each reads the day key
// before either writes it, so without this both would post. claim(userId)
// returns true when no save for that account is running and marks one;
// release(userId) clears it once that save ends. A save for another account
// never blocks this one, so a switch mid save still gets its own snapshot.
export function createSnapshotSaveLatch() {
  const running = new Set();
  return {
    claim(userId) {
      if (!userId || running.has(userId)) return false;
      running.add(userId);
      return true;
    },
    release(userId) {
      running.delete(userId);
    },
  };
}
