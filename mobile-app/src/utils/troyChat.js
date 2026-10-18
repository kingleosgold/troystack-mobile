/**
 * TroyStack - Troy's chat, said the same way on the phone and on troystack.ai
 *
 * The webapp's chat (src/ui/TroyChat.tsx, src/lib/text.ts and the LimitCard
 * in src/routes/Troy.tsx in troystack-webapp) is the reference. Nothing here
 * imports React Native, so it runs under `node --test`.
 */

import { TROY_GOLD_DAILY_QUESTIONS, TROY_FREE_DAILY_QUESTIONS, trialLabel } from './goldOffer.js';

const NY = 'America/New_York';

/**
 * The house style has no long dashes. Troy's replies sometimes use them, so
 * at display time a dash between words becomes a comma, an en dash between
 * numbers becomes a hyphen, and one that opens a line is dropped. The same
 * rules as plainDashes in the webapp's src/lib/text.ts.
 */
export function plainDashes(text) {
  if (!text) return '';
  return text
    .replace(/(\d)\s*–\s*(\d)/g, '$1-$2')
    .replace(/^[ \t]*[—–][ \t]*/gm, '')
    .replace(/[ \t]*[—–]+[ \t]*(?=[.,;:!?)\]]|$)/gm, '')
    .replace(/[ \t]*[—–]+[ \t]*/g, ', ')
    .replace(/,\s*,/g, ',');
}

/**
 * Whether a send came back refused at the day's question limit. The API
 * answers 403 with { error, questionsUsed, questionsLimit, resetsAt } (the
 * quota check in troy-chat.js), and that body is all the phone reads.
 */
export function isQuotaRefusal(body) {
  return !!body && typeof body.error === 'string' && body.questionsLimit != null;
}

function timeET(d) {
  return `${d.toLocaleTimeString('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' })} ET`;
}

function dayET(d) {
  return d.toLocaleDateString('en-CA', { timeZone: NY });
}

// The calendar day after a YYYY-MM-DD date. Counted on the calendar, not as
// 24 hours, since a day with a clock change is 23 or 25.
function nextDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * When the questions come back, as the webapp's LimitCard says it: "at 9:14
 * PM ET", "tomorrow at 9:14 PM ET" or "Tuesday at 9:14 PM ET". Without a time
 * from the server, "tomorrow".
 */
export function troyResetLabel(iso, now = new Date()) {
  const t = new Date(iso || NaN);
  if (!Number.isFinite(t.getTime())) return 'tomorrow';
  const time = timeET(t);
  if (dayET(t) === dayET(now)) return `at ${time}`;
  if (dayET(t) === nextDay(dayET(now))) return `tomorrow at ${time}`;
  return `${t.toLocaleDateString('en-US', { weekday: 'long', timeZone: NY })} at ${time}`;
}

/**
 * What someone sees when Troy's questions for the day are used up, in the
 * webapp's words. plan is upsellPlan's answer. Only a 'free' account is
 * pitched Gold, and only offered the free trial when this Apple ID can still
 * get one. One that pays, or can't be checked yet, gets the plain note.
 * quota is the server's refusal body, or { questionsLimit } from the phone's
 * own count, which has no reset time.
 */
export function troyLimitPrompt({ quota, plan, trial, now = new Date() }) {
  const limit = Number(quota?.questionsLimit) || 0;
  const back = `They come back ${troyResetLabel(quota?.resetsAt, now)}.`;
  if (plan !== 'free') {
    return {
      title: "Today's questions are used",
      message: limit ? `That's today's ${limit} questions to Troy. ${back}` : `That's today's questions to Troy. ${back}`,
      action: null,
    };
  }
  const gold = trial
    ? `Gold gives you ${TROY_GOLD_DAILY_QUESTIONS} a day, and you can try it free for ${trialLabel(trial)}.`
    : `Gold gives you ${TROY_GOLD_DAILY_QUESTIONS} a day.`;
  return {
    title: "Today's questions are used",
    message: `${limit ? `That's today's ${limit} free questions.` : "That's today's free questions."} ${back} ${gold}`,
    action: trial ? 'Try Gold free' : 'See Gold',
  };
}

// ── Guests ────────────────────────────────────────────────────────
//
// Someone using the app without an account talks to Troy the way a visitor
// on troystack.ai does: POST /v1/troy/ask with the chat so far, and GET
// /v1/troy/ask/status for questions left (src/routes/troy-ask.js in
// troystack-api). Nothing is saved on the server, so the chat lives on the
// phone only. The API counts 3 a day for each connection.

// The API refuses a guest's question past this many characters.
export const GUEST_MESSAGE_MAX = 500;

// How many earlier turns go along with a guest's question, as the webapp sends.
const GUEST_HISTORY_TURNS = 6;

/**
 * What a guest's next question carries of the chat so far: each question Troy
 * answered, with its answer, newest last. A question that failed or was
 * stopped never got one and stays out. The same as answeredTurns in the
 * webapp's src/services/troy.ts.
 */
export function answeredTurns(messages) {
  const turns = [];
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < list.length - 1; i++) {
    const q = list[i];
    const a = list[i + 1];
    if (q?.role === 'user' && a?.role === 'assistant' && q.content && a.content) {
      turns.push({ role: 'user', content: q.content }, { role: 'assistant', content: a.content });
    }
  }
  return turns.slice(-GUEST_HISTORY_TURNS);
}

/**
 * What a guest's /v1/troy/ask came back with, from its HTTP status and body.
 * reply: Troy answered, with the quota after it. limit: the day's questions
 * are used, with the quota. unavailable: the API has no guest route. error:
 * anything else, a 429 from the general rate limiter included, which passes
 * in a minute.
 */
export function readGuestAsk(status, body) {
  const b = body || {};
  if (status >= 200 && status < 300 && typeof b.reply === 'string' && b.reply.trim()) {
    return { kind: 'reply', reply: b.reply, quota: guestQuota(b) };
  }
  if (status === 429 && b.questionsLimit != null) return { kind: 'limit', quota: guestQuota(b) };
  if (status === 404 || status === 405) return { kind: 'unavailable' };
  return { kind: 'error', error: typeof b.error === 'string' ? b.error : null };
}

/** The quota from an ask or status body, or null when it has none. */
export function guestQuota(body) {
  if (!body || body.questionsLimit == null) return null;
  return {
    questionsUsed: Number(body.questionsUsed) || 0,
    questionsLimit: Number(body.questionsLimit) || 0,
    resetsAt: typeof body.resetsAt === 'string' ? body.resetsAt : null,
  };
}

/**
 * How many questions a guest has left today, or null when unknown. A count
 * read before its reset time has passed is unknown, so a guest who waited
 * out the limit with the chat open isn't held to it. The server decides.
 */
export function guestQuestionsLeft(quota, now = new Date()) {
  if (!quota || !quota.questionsLimit) return null;
  const resets = new Date(quota.resetsAt || NaN).getTime();
  if (Number.isFinite(resets) && resets <= now.getTime()) return null;
  return Math.max(0, quota.questionsLimit - quota.questionsUsed);
}

/** The chat header's line for a guest, as troystack.ai says it. */
export function guestQuestionsLine(quota, now = new Date()) {
  const left = guestQuestionsLeft(quota, now);
  return left == null ? null : `${left} of ${quota.questionsLimit} free questions left today`;
}

/**
 * What a guest sees when the day's questions are used, in the words of the
 * webapp's limit card for visitors. The way on is a free account. Gold isn't
 * offered here, since Gold on a phone with no account doesn't add questions.
 */
export function guestLimitPrompt(quota, now = new Date()) {
  const limit = Number(quota?.questionsLimit) || 0;
  return {
    title: "Today's questions are used",
    message: `${limit ? `That's today's ${limit} free questions.` : "That's today's free questions."} They come back ${troyResetLabel(quota?.resetsAt, now)}. A free account gets you three more a day, with your stack in context.`,
    action: 'Create a free account',
  };
}

// ── The chat around the replies ───────────────────────────────────

/** The chat header's line for a free account, as troystack.ai says it. */
export const FREE_PLAN_LINE = `Free plan, ${TROY_FREE_DAILY_QUESTIONS} a day`;

/**
 * The time under one of Troy's replies, on the phone's own clock, as the
 * webapp's timeLabel in src/ui/TroyChat.tsx shows it. Empty without one.
 */
export function replyTimeLabel(iso) {
  const d = new Date(iso || NaN);
  return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
}

const DAY_MS = 86400000;

/**
 * Chats newest first and grouped Today, Yesterday, This week and Earlier,
 * the same as groupConversations in the webapp's src/routes/Troy.tsx. This
 * week is the five days before yesterday. Empty groups are left out.
 */
export function groupConversations(list, now = new Date()) {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const when = (c) => new Date(c?.updated_at || c?.created_at).getTime() || 0;
  const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => when(b) - when(a));
  const groups = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const c of sorted) {
    const t = when(c);
    if (t >= startToday) groups[0].items.push(c);
    else if (t >= startToday - DAY_MS) groups[1].items.push(c);
    else if (t >= startToday - 6 * DAY_MS) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length);
}

// A free account sees its newest few chats, on the web and in the app.
export const FREE_CHAT_HISTORY = 3;

/** The note under a free account's chats when some are held back. */
export function chatHistoryNote(count) {
  return `You have ${count} chats with Troy. Gold keeps every one of them, on the web and in the app.`;
}
