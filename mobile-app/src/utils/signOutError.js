/**
 * TroyStack - what a failed sign out says
 *
 * Supabase's sign out has to reach the server, so it fails offline and the
 * phone stays signed in. Saying "try again" alone hides why.
 */

export function signOutFailMessage(error) {
  const unreachable = error?.name === 'AuthRetryableFetchError'
    || error?.status === 0
    || /network request failed|failed to fetch/i.test(error?.message || '');
  return unreachable
    ? "Couldn't reach TroyStack, so you're still signed in. Check your connection and try again."
    : 'Failed to sign out. Please try again.';
}
