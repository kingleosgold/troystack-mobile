/**
 * TroyStack - Which local holdings an account's first sync adds to it
 *
 * The first time an account syncs on this phone, the holdings already on the
 * phone go up to it, so a guest who signs in keeps their stack even when the
 * account has holdings of its own. The phone records which account its stack
 * belongs to, and a stack that belongs to another account never goes up. A
 * holding that is already a row in the cloud never goes up again. Nothing
 * here imports React Native, so it runs under `node --test`.
 */

// The Supabase user id whose stack is on this phone. Sign out clears it.
export const HOLDINGS_OWNER_KEY = 'stack_holdings_owner';

/**
 * Whether the phone's stack may go up to this account. A stack with no owner
 * is a guest's or from before accounts. One owned by this account is its own.
 * One owned by another account stays out of this one, as after a session
 * that ended without a sign out.
 */
export function mayUploadLocalStack(owner, userId) {
  return !owner || owner === userId;
}

/**
 * The holdings to insert. A holding with a supabase_id came from the cloud,
 * so it's skipped even when the cloud row has since been deleted or never had
 * a local id. So is one whose local id the account already has.
 */
export function holdingsToUpload(items, existingLocalIds) {
  return (items || []).filter((item) => !item.supabase_id && !existingLocalIds.has(item.id));
}
