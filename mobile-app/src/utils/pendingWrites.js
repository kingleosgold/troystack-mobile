// Holdings writes to the cloud that haven't landed yet. A sync uploads the
// stack it read and then swaps in the cloud's copy, so a write still in
// flight when it fetches can be missing from that copy, and the swap drops an
// add or brings a delete back. The sync waits for these before it reads.
// Nothing here imports React Native, so it runs under `node --test`.

// How long a sync waits for writes in flight before it gives up. A session's
// first sync then takes the spaced out retry, and a pull to refresh after
// that is tried again by the next pull
export const HOLDING_WRITES_WAIT_MS = 30000;

// How long a sync waits for its upload and the cloud's copy. Longer than the
// write wait, since a first sync can send a whole stack. Past it the sync
// lets go, the upload keeps running, and the next sync's dedupe by local id
// keeps a late insert from going up twice
export const SYNC_UPLOAD_WAIT_MS = 60000;

// How often a wait with a stop check looks at it
export const STOP_POLL_MS = 250;

export const pendingWrites = () => {
  // Each held write maps to the account it writes for
  const writes = new Map();
  return {
    // Runs the write and holds it until it settles. A failed write still
    // rejects to its caller, and only stops being waited for. The account is
    // the one whose rows the write touches.
    track(run, account) {
      const write = Promise.resolve().then(run);
      const held = write.then(() => {}, () => {});
      writes.set(held, account);
      held.then(() => writes.delete(held));
      return write;
    },
    // Settles once every write started before the call has, whatever each
    // one's result. A write started after the call isn't waited for. With a
    // limit it answers false once that many ms pass first, since the Supabase
    // client has no request timeout and a stalled write would hold the
    // waiter, and the gates it keeps shut, for as long as it hangs. With an
    // account it waits only for that account's writes, since another
    // account's rows aren't in what its sync fetches, so a hung write from
    // the last account can't hold the next one's syncs. With a stop check it
    // answers false as soon as that turns true, so a sync the account has
    // left behind lets go of the gates at once rather than at the limit.
    settled(limitMs, account, stopped) {
      const waitFor = [...writes].filter(([, owner]) => account === undefined || owner === account).map(([held]) => held);
      const all = Promise.all(waitFor).then(() => true);
      if (!(limitMs > 0)) return all;
      let timer;
      let poll;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(false), limitMs); });
      const left = typeof stopped === 'function'
        ? new Promise((resolve) => { poll = setInterval(() => { if (stopped()) resolve(false); }, STOP_POLL_MS); })
        : null;
      return Promise.race(left ? [all, late, left] : [all, late]).finally(() => {
        clearTimeout(timer);
        clearInterval(poll);
      });
    },
    get size() {
      return writes.size;
    },
    // How many writes for this account haven't settled yet
    countFor(account) {
      return [...writes.values()].filter((owner) => owner === account).length;
    },
  };
};

// Waits for one write the caller started, for at most limitMs, without
// aborting it. Answers { value } when it resolves, { error } when it throws,
// { late: true } past the limit and { stopped: true } once the stop check
// turns true, so a stalled request can't hold its caller and the gates it
// keeps shut for as long as it hangs.
export const settleWithin = (write, limitMs, stopped) => {
  let timer;
  let poll;
  const done = Promise.resolve(write).then((value) => ({ value }), (error) => ({ error }));
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ late: true }), limitMs); });
  const left = typeof stopped === 'function'
    ? new Promise((resolve) => { poll = setInterval(() => { if (stopped()) resolve({ stopped: true }); }, STOP_POLL_MS); })
    : null;
  return Promise.race(left ? [done, late, left] : [done, late]).finally(() => {
    clearTimeout(timer);
    clearInterval(poll);
  });
};

// Sends each job in turn through send, which starts its write, and waits for
// them only until by, one deadline for all of them, or until the stop check
// turns true. A job that fails, or that the wait lets go of or never starts,
// comes back in the list of those not sent, so the caller keeps it for the
// next try. A write the wait let go of keeps running.
export async function sendAllWithin(jobs, send, by, stopped) {
  const unsent = [];
  let late = false;
  for (const job of jobs || []) {
    if (late || Date.now() >= by || (typeof stopped === 'function' && stopped())) {
      unsent.push(job);
      continue;
    }
    const sent = await settleWithin(send(job), by - Date.now(), stopped);
    if (sent.late || sent.stopped) late = true;
    if (!sent.value || sent.value.error) unsent.push(job);
  }
  return unsent;
}
