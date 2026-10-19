/**
 * TroyStack - The one-time free week offer
 *
 * The app offers Gold's free trial once per device, at whichever of two
 * moments comes first. One is right after someone adds their first holding
 * (by hand, from a receipt scan or from an import) and is back on the
 * dashboard looking at the stack's live value. The other is for someone who
 * talks to Troy before adding anything: after an answer from Troy, once they
 * have had a moment to read it. This file holds the rules and the words, and
 * App.js holds the sheet. Nothing here imports React Native, so it runs
 * under `node --test`.
 */

import { TROY_FREE_DAILY_QUESTIONS, TROY_GOLD_DAILY_QUESTIONS, TROY_GOLD_DAILY_VOICE, trialLabel } from './goldOffer.js';

// Set once the offer has shown on this device, whatever was tapped.
export const FREE_WEEK_OFFER_KEY = 'stack_free_week_offer_shown';

// How long the dashboard shows the stack's value before the offer comes up.
export const FREE_WEEK_OFFER_DELAY_MS = 1500;

// How long Troy's answer sits on screen, with nothing else going on in the
// chat, before the offer comes up. Long enough to read a short answer.
export const FREE_WEEK_OFFER_TROY_DELAY_MS = 6000;

/**
 * Whether an add made the stack's first holding. holdingsBefore is how many
 * holdings there were just before the add, and added is how many it added. A
 * signed-in account counts only once this session has read its stack from
 * the cloud, so an empty screen that's still waiting on a sync isn't taken
 * for a new stack. Holdings that arrive by sync, restore or launch never come
 * through here at all.
 */
export function isFirstHolding({ holdingsBefore, added, signedIn, cloudStackRead }) {
  if (!(added > 0) || holdingsBefore !== 0) return false;
  return !signedIn || cloudStackRead === true;
}

/**
 * Which moment the screen showing is for: 'holding' on the dashboard after a
 * first holding, 'troy' in Troy's chat after an answer from him, or null.
 */
export function freeWeekOfferMoment({ firstHoldingAdded, troyAnswered, screen } = {}) {
  if (firstHoldingAdded && screen === 'Dashboard') return 'holding';
  if (troyAnswered && screen === 'TroyChat') return 'troy';
  return null;
}

/**
 * Why the offer can't show right now, or null when it can. Takes:
 *   shownBefore        true once shown on this device, null until that's known
 *   firstHoldingAdded  an add made the stack's first holding (isFirstHolding)
 *   troyAnswered       Troy answered a question sent this session
 *   goldScreenSeen     the Gold screen has opened this session, so the person
 *                      has just seen Gold and doesn't need a second pitch
 *   planKnown          RevenueCat and the account's profile have answered
 *   paid               upsellPlan (goldOffer.js) says the account pays
 *   trial              the trial loadGoldOffering found for this Apple ID, or null
 *   demo               screenshot mode
 *   mainScreen         the app is past its loading, sign-in and lock screens
 *   screen             the screen showing, 'Dashboard' after a first holding
 *                      and 'TroyChat' after an answer from Troy
 *   livePrices         spot prices came from the API this session
 *   stackValue         the stack's value at those prices
 *   troyBusy           in Troy's chat, a question is being typed, sent or
 *                      spoken, or an answer is being read out loud
 *   sheets             { name: open } for every sheet, screen or drawer that
 *                      can sit over the dashboard, the Gold screen and the
 *                      onboarding steps among them
 *   alertOpen          an alert is up (watchAlerts)
 *   appActive          the app is in front, not behind a system prompt
 */
export function freeWeekOfferBlocker(state) {
  const s = state || {};
  if (s.shownBefore !== false) return s.shownBefore ? 'shown-before' : 'flag-unknown';
  if (!s.firstHoldingAdded && !s.troyAnswered) return 'no-moment';
  if (s.goldScreenSeen) return 'gold-screen-seen';
  if (!s.planKnown) return 'plan-unknown';
  if (s.paid) return 'gold';
  if (!s.trial) return 'no-trial';
  if (s.demo) return 'demo';
  if (!s.mainScreen) return 'not-ready';
  const moment = freeWeekOfferMoment(s);
  if (!moment) return s.firstHoldingAdded ? 'not-dashboard' : 'not-troy-chat';
  if (moment === 'holding') {
    if (!s.livePrices) return 'no-live-prices';
    if (!(s.stackValue > 0)) return 'no-value';
  }
  if (moment === 'troy' && s.troyBusy) return 'troy-busy';
  const sheet = Object.entries(s.sheets || {}).find(([, open]) => Boolean(open));
  if (sheet) return `sheet:${sheet[0]}`;
  if (s.alertOpen) return 'alert';
  if (!s.appActive) return 'app-inactive';
  return null;
}

// Under a guest's list of what Gold adds, so the first two read true.
export const GUEST_ACCOUNT_LINE = "The morning brief and Gold's Troy questions and voice come with a free account.";

/**
 * The sheet's words for the trial it offers. A seven day trial reads as a
 * week and a one month trial as a month; any other length is named as it is.
 * The lead names the moment, 'holding' or 'troy'. A guest also gets a Restore
 * line. Only RevenueCat can say a guest pays, and it doesn't know about a
 * Lifetime bought on an earlier install until Restore, while the Apple ID
 * still reads trial eligible. And a guest gets an account line, since on a
 * phone with no account Troy stays on the guest questions, voice is off and
 * no morning brief comes, Gold or not.
 */
export function freeWeekOfferCopy(trial, { guest = false, moment = 'holding' } = {}) {
  const week = trial?.unit === 'day' && trial.count === 7;
  const month = trial?.unit === 'month' && trial.count === 1;
  const span = week ? 'a week' : month ? 'a month' : trialLabel(trial);
  return {
    title: `Try Gold free for ${span}`,
    lead: moment === 'troy'
      ? `Free accounts get ${TROY_FREE_DAILY_QUESTIONS} questions to Troy a day. Here's what Gold adds.`
      : "Now that you've started your stack, here's what Gold adds.",
    points: [
      'A brief each morning on the metals and your stack',
      `Up to ${TROY_GOLD_DAILY_QUESTIONS} questions to Troy a day and ${TROY_GOLD_DAILY_VOICE} voice uses, spoken questions and answers together`,
      'Price history charts for gold, silver, platinum and palladium',
      'Unlimited receipt scans',
    ],
    start: week ? 'Start my free week' : month ? 'Start my free month' : 'Start my free trial',
    later: 'Not now',
    restore: guest ? 'Already have Gold? Restore purchases' : null,
    account: guest ? GUEST_ACCOUNT_LINE : null,
  };
}

const WATCH = Symbol.for('troystack.alertWatch');

/**
 * Keeps count of open alerts, so the offer never comes up on top of one.
 * React Native can't say whether an alert is showing, so this wraps
 * AlertModule.alert once. The mark that says it's wrapped sits on the Alert
 * module under a Symbol.for key, which every copy of this file shares, so a
 * Fast Refresh that runs this file or App.js again finds it and wraps
 * nothing twice. An alert counts as open from the call until one of
 * its buttons is pressed, since every button closes its alert, or on Android
 * until it's dismissed by a tap outside. The caller's own onPress and
 * onDismiss run first, so an alert that opens another never reads as closed
 * in between. An alert called without buttons gets the single OK button
 * React Native would have shown, so that press is counted too. Returns
 * { isOpen(), subscribe(fn) }; fn hears true when the first alert opens and
 * false when the last one closes, and subscribe returns the unsubscribe.
 */
export function watchAlerts(AlertModule) {
  if (AlertModule[WATCH]) return AlertModule[WATCH];
  const show = AlertModule.alert;
  const listeners = new Set();
  let open = 0;
  const tell = () => listeners.forEach((fn) => fn(open > 0));

  AlertModule.alert = function alert(title, message, buttons, options) {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      open -= 1;
      if (open === 0) tell();
    };
    const given = Array.isArray(buttons) && buttons.length > 0
      ? buttons
      : [{ text: 'OK', style: 'cancel' }];
    const watched = given.map((button) => ({
      ...button,
      onPress: (...args) => {
        try {
          return button?.onPress?.(...args);
        } finally {
          close();
        }
      },
    }));
    const watchedOptions = {
      ...options,
      onDismiss: (...args) => {
        try {
          return options?.onDismiss?.(...args);
        } finally {
          close();
        }
      },
    };
    open += 1;
    if (open === 1) tell();
    try {
      return show.call(this, title, message, watched, watchedOptions);
    } catch (error) {
      close();
      throw error;
    }
  };

  const watch = {
    isOpen: () => open > 0,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  AlertModule[WATCH] = watch;
  return watch;
}
