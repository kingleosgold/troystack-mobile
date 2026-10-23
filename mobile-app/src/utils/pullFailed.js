/**
 * TroyStack - The notice for a pull on My Stack that didn't reach the account
 *
 * A pull to refresh on My Stack syncs the stack with the account. When that
 * sync fails, as on a bad connection, the spinner just stopped and the user
 * couldn't tell their stack wasn't checked against the account. Now the pull
 * says so. Only a pull the user made shows it, never the auto sync, and only
 * while the same account is signed in. Nothing here imports React Native, so
 * it runs under `node --test`.
 */

// Whether a pull's sync failed for the account still signed in
export const pullFailedDue = ({ failed, userIdAtPull, userIdNow }) => (
  !!failed && !!userIdAtPull && userIdAtPull === userIdNow
);

export function pullFailedAlert() {
  return {
    title: "Couldn't reach your account",
    message: "Your stack on this phone is unchanged. Pull down again once you're back online to sync it.",
  };
}
