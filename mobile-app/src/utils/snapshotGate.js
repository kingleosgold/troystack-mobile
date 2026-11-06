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
