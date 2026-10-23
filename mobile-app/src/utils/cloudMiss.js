/**
 * TroyStack - The notice for a save that didn't reach the account
 *
 * A signed-in add or edit whose cloud write failed is kept on the phone and
 * marked, and the next sync sends it up. Until then the user thought it was
 * in their account, so the app says once that it isn't yet and how to send
 * it. A run of failures, like an import on a bad connection, shows one
 * notice, not one per holding. Nothing here imports React Native, so it runs
 * under `node --test`.
 */

export const CLOUD_MISS_GAP_MS = 30000;

// Whether a notice is due, given when the last one showed
export const cloudMissDue = (lastAt, now, gap = CLOUD_MISS_GAP_MS) => (
  !Number.isFinite(lastAt) || now - lastAt >= gap
);

// The words for an add ('add') or a change to a holding ('edit')
export function cloudMissAlert(kind) {
  const what = kind === 'edit' ? 'Your change' : 'This holding';
  return {
    title: "Saved on this phone only",
    message: `${what} didn't reach your account yet. Pull down on the Dashboard to send it now, or TroyStack sends it the next time it opens.`,
  };
}
