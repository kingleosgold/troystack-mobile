/**
 * TroyStack - The notice for a pull on My Stack that didn't reach the account
 *
 * A pull to refresh on My Stack syncs the stack with the account. When that
 * sync fails, as on a bad connection, the spinner just stopped and the user
 * couldn't tell their stack wasn't checked against the account. Now the pull
 * says so. It judges only the sync the pull waited on, never an auto sync that
 * started or failed around it, and only while the same account is signed in. Nothing here imports React Native, so
 * it runs under `node --test`.
 */

// Whether a pull's sync failed for the account still signed in, with no
// sign out or account change since the pull
export const pullFailedDue = ({ signedIn, failed, sameAccount }) => (
  !!signedIn && !!failed && !!sameAccount
);

// Whether a pull's sync, which didn't fail, still left an edit it resent
// off the account, for the account still signed in
export const pullUnsentDue = ({ signedIn, unsent, sameAccount }) => (
  !!signedIn && unsent > 0 && !!sameAccount
);

export function pullFailedAlert() {
  return {
    title: "Couldn't sync your stack",
    message: "Your stack on this phone is unchanged and wasn't checked against your account. Pull down to try again.",
  };
}
