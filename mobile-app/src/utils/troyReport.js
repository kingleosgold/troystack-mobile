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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The API takes ids only as UUIDs and refuses anything else. Messages the
// app makes itself, a daily brief or a fallback reply, carry ids like
// brief-..., so those go without one rather than fail the report.
function uuidOrNull(value) {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/**
 * The reply cut to the cap without splitting a character. A cut through an
 * emoji leaves half of a surrogate pair, which encodeURIComponent throws on.
 */
export function reportContent(content) {
  const text = String(content || '').slice(0, REPORT_CONTENT_MAX);
  const last = text.charCodeAt(text.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? text.slice(0, -1) : text;
}

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
        userId: uuidOrNull(userId),
        conversationId: uuidOrNull(conversationId),
        messageId: uuidOrNull(message?.id),
        reason,
        content: reportContent(message?.content),
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
 * The report as text: the reason, the ids and the reply. It's the email's
 * body, and what the app copies when no email app opens.
 */
export function reportText({ message, reason, conversationId }) {
  const label = REPORT_REASONS.find(r => r.key === reason)?.label || reason;
  return [
    `Reason: ${label}`,
    `Message: ${message?.id || 'unknown'}`,
    `Conversation: ${conversationId || 'none'}`,
    '',
    reportContent(message?.content),
  ].join('\n');
}

/**
 * A mailto link to support with the report in the body, for when the route
 * can't take it.
 */
export function reportEmailUrl(report) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Report a Troy reply')}&body=${encodeURIComponent(reportText(report))}`;
}
