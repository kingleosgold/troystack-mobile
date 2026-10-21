// Holdings writes to the cloud that haven't landed yet. A sync uploads the
// stack it read and then swaps in the cloud's copy, so a write still in
// flight when it fetches can be missing from that copy, and the swap drops an
// add or brings a delete back. The sync waits for these before it reads.
// Nothing here imports React Native, so it runs under `node --test`.

export const pendingWrites = () => {
  const writes = new Set();
  return {
    // Runs the write and holds it until it settles. A failed write still
    // rejects to its caller, and only stops being waited for.
    track(run) {
      const write = Promise.resolve().then(run);
      const held = write.then(() => {}, () => {});
      writes.add(held);
      held.then(() => writes.delete(held));
      return write;
    },
    // Settles once every write started before the call has, whatever each
    // one's result. A write started after the call isn't waited for.
    settled() {
      return Promise.all([...writes]).then(() => {});
    },
    get size() {
      return writes.size;
    },
  };
};
