/**
 * TroyStack - deleting an account from the app
 *
 * Google Play's account deletion rule and Apple's guideline 5.1.1(v) both
 * want an account made in the app to be deletable from inside it. The app
 * calls DELETE /v1/account with the Supabase session token, and the API
 * deletes that account and everything kept for it. The token says whose
 * account it is, never anything in the request.
 */

export const DELETE_TIMEOUT_MS = 30000;

const RETRY_MESSAGE = "Your account couldn't be deleted just now. Try again, or email support@troystack.com.";

/**
 * @returns {Promise<{ kind: 'deleted' }
 *   | { kind: 'expired' }
 *   | { kind: 'plan', message: string }
 *   | { kind: 'retry', message: string }>}
 *   'deleted' on 200. 'expired' with no token or on 401, so the person signs
 *   in again first. 'plan' on 409, a troystack.ai plan that would charge
 *   again, with the API's message saying to cancel it first. 'retry' on 503,
 *   500, any other answer, a timeout or no connection, with the API's message
 *   when it sent one. Nothing is deleted unless the answer is 'deleted'.
 */
export async function deleteAccount({ apiBase, token, fetchImpl = fetch, timeoutMs = DELETE_TIMEOUT_MS }) {
  if (!token) return { kind: 'expired' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${apiBase}/v1/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status === 200) return { kind: 'deleted' };
    if (res.status === 401) return { kind: 'expired' };
    let body = null;
    try { body = await res.json(); } catch {}
    if (res.status === 409) return { kind: 'plan', message: body?.message || RETRY_MESSAGE };
    return { kind: 'retry', message: body?.error || RETRY_MESSAGE };
  } catch {
    return { kind: 'retry', message: RETRY_MESSAGE };
  } finally {
    clearTimeout(timer);
  }
}
