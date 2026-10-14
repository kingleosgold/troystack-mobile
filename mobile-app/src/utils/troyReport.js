/**
 * TroyStack - reporting a Troy reply
 *
 * Google Play's AI-generated content policy asks every app that generates
 * content with AI to let people report or flag offensive content without
 * leaving the app. Each of Troy's replies carries a Report button. The app
 * sends the reply to POST /v1/troy/report, and the API keeps it for review.
 * Until that route is live the app opens a support email with the reply in
 * it instead, so a report is never lost.
 */

export const SUPPORT_EMAIL = 'support@troystack.com';
export const REPORT_TIMEOUT_MS = 10000;
// The API caps a reply it stores at this length, and so does the email.
export const REPORT_CONTENT_MAX = 4000;

export const REPORT_REASONS = [
  { key: 'offensive', label: 'Offensive or harmful' },
  { key: 'wrong', label: 'Wrong or misleading' },
];

/**
 * POST /v1/troy/report. The session token goes along when there is one, and
 * a guest's report goes without it.
 * @returns {Promise<'sent'|'unavailable'>} 'sent' on any 2xx. 'unavailable'
 *   on any other answer, a timeout or no connection, so the caller offers
 *   the email instead.
 */
export async function sendTroyReport({
  apiBase, token, userId, conversationId, message, reason,
  fetchImpl = fetch, timeoutMs = REPORT_TIMEOUT_MS,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(`${apiBase}/v1/troy/report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: userId || null,
        conversationId: conversationId || null,
        messageId: message?.id || null,
        reason,
        content: String(message?.content || '').slice(0, REPORT_CONTENT_MAX),
      }),
      signal: controller.signal,
    });
    return res.ok ? 'sent' : 'unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A mailto link to support with the reply in the body, for when the route
 * can't take the report.
 */
export function reportEmailUrl({ message, reason, conversationId }) {
  const label = REPORT_REASONS.find(r => r.key === reason)?.label || reason;
  const body = [
    `Reason: ${label}`,
    `Message: ${message?.id || 'unknown'}`,
    `Conversation: ${conversationId || 'none'}`,
    '',
    String(message?.content || '').slice(0, REPORT_CONTENT_MAX),
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Report a Troy reply')}&body=${encodeURIComponent(body)}`;
}
