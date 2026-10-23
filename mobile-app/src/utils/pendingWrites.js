// Holdings writes to the cloud that haven't landed yet. A sync uploads the
// stack it read and then swaps in the cloud's copy, so a write still in
// flight when it fetches can be missing from that copy, and the swap drops an
// add or brings a delete back. The sync waits for these before it reads.
// Nothing here imports React Native, so it runs under `node --test`.

// How long a sync waits for writes in flight before it gives up. A session's
// first sync then takes the spaced out retry, and a pull to refresh after
// that is tried again by the next pull
export const HOLDING_WRITES_WAIT_MS = 30000;

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
    // one's result. A write started after the call isn't waited for. With a
    // limit it answers false once that many ms pass first, since the Supabase
    // client has no request timeout and a stalled write would hold the
    // waiter, and the gates it keeps shut, for as long as it hangs.
    settled(limitMs) {
      const all = Promise.all([...writes]).then(() => true);
      if (!(limitMs > 0)) return all;
      let timer;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(false), limitMs); });
      return Promise.race([all, late]).finally(() => clearTimeout(timer));
    },
    get size() {
      return writes.size;
    },
  };
};
