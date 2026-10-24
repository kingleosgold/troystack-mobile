// The cloud row each holding went to, by local id, for the holdings this
// session added or found by lookup. A successful add never writes its row id
// back onto the holding, so until the next sync swaps in the cloud's copy an
// edit or a delete of it would find its row by a lookup. One that fails would
// leave an edit marked as an add, which the sync skips since the row is
// there, and a delete that ran before the add landed would miss the row.
// Each row names its account, so a row is never used for another one.
// Nothing here imports React Native, so it runs under `node --test`.
export const knownRows = () => {
  const rows = new Map();
  return {
    note(localId, rowId, account) {
      if (localId == null || !rowId || !account) return;
      rows.set(localId, { rowId, account });
    },
    // The row this account's holding went to, or null to look it up
    rowFor(localId, account) {
      const row = rows.get(localId);
      return row && account && row.account === account ? row.rowId : null;
    },
    forget(localId) {
      rows.delete(localId);
    },
    clear() {
      rows.clear();
    },
  };
};
