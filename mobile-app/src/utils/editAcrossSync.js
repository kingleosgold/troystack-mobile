// An edit sheet keeps the stack count and account from when it opened, and
// Save drops an edit made across a swap of the whole stack. A sync of the
// account's own stack swaps in the cloud's copy of the same holdings, so an
// edit may carry across it and land on that copy. Any other swap, a restore,
// a reset or a sync that replaced another account's stack, still drops it.
// Nothing here imports React Native, so it runs under `node --test`.

// Whether an edit opened at `opened` may still save. `gen` is the stack count
// now, `foreignGen` the count at the last swap that wasn't a same-stack sync.
export const editOutlivesSwaps = (opened, { gen, foreignGen, userId }) => (
  !!opened
  && opened.userId === (userId || null)
  && (opened.gen === gen || foreignGen <= opened.gen)
);

// The holding with this local id in the stack now, or null.
export const holdingInStack = (lists, id) => {
  for (const list of lists) {
    const found = (list || []).find((item) => item.id === id);
    if (found) return found;
  }
  return null;
};
