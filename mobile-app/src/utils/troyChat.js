/**
 * TroyStack - Troy's chat, said the same way on the phone and on troystack.ai
 *
 * The webapp's chat (src/ui/TroyChat.tsx, src/lib/text.ts and the LimitCard
 * in src/routes/Troy.tsx in troystack-webapp) is the reference. Nothing here
 * imports React Native, so it runs under `node --test`.
 */

import { TROY_GOLD_DAILY_QUESTIONS, trialLabel } from './goldOffer.js';

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
