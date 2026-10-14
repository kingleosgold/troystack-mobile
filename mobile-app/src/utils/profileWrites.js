/**
 * TroyStack - Profile writes in order
 *
 * The app's profile writes are separate requests, and the server applies them
 * in the order they arrive, not the order they were asked for. A free that
 * went out first and was slow could land after a newer Gold and leave the
 * profile free. So writes go one at a time: each waits for the one before it
 * to settle, and one that a newer write overtook while it waited is skipped,
 * since the newer one lands after it anyway. Nothing here imports React
 * Native, so it runs under `node --test`.
 */

/**
 * A queue where the newest write wins. write(run, { stillWanted }) runs run()
 * once every write asked for before it has settled, unless a newer write was
 * asked for in the meantime or stillWanted() says no when its turn comes. It
 * resolves to { skipped: true }, or to { result } with what run() resolved
 * to, and rejects if run() throws, without holding up the writes after it.
 */
export function latestWriteQueue() {
  let tail = Promise.resolve();
  let newest = 0;
  return {
    write(run, { stillWanted = () => true } = {}) {
      const ticket = ++newest;
      const turn = tail.then(async () => {
        if (ticket !== newest || !stillWanted()) return { skipped: true };
        return { result: await run() };
      });
      tail = turn.catch(() => {});
      return turn;
    },
  };
}
