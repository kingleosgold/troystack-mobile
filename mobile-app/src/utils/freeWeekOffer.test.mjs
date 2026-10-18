// Run with: node --test mobile-app/src/utils/freeWeekOffer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_WEEK_OFFER_DELAY_MS,
  FREE_WEEK_OFFER_KEY,
  FREE_WEEK_OFFER_TROY_DELAY_MS,
  freeWeekOfferBlocker,
  freeWeekOfferCopy,
  freeWeekOfferMoment,
  isFirstHolding,
  watchAlerts,
} from './freeWeekOffer.js';
import { TROY_FREE_DAILY_QUESTIONS, TROY_GOLD_DAILY_QUESTIONS, TROY_GOLD_DAILY_VOICE } from './goldOffer.js';

const WEEK = { count: 7, unit: 'day', cycle: 'yearly' };

// The moment the offer is for: a first holding just added, back on the
// dashboard with the live value showing, nothing else open.
function ready(overrides = {}) {
  return {
    shownBefore: false,
    firstHoldingAdded: true,
    goldScreenSeen: false,
    planKnown: true,
    paid: false,
    trial: WEEK,
    demo: false,
    mainScreen: true,
    screen: 'Dashboard',
    livePrices: true,
    stackValue: 2412.5,
    sheets: { gold: false, tutorial: false, aiConsent: false, add: false, scanPreview: false, settings: null, drawer: false },
    alertOpen: false,
    appActive: true,
    ...overrides,
  };
}

test('an add makes the first holding only when the stack was empty', () => {
  assert.equal(isFirstHolding({ holdingsBefore: 0, added: 1, signedIn: false }), true, 'a guest adding by hand');
  assert.equal(isFirstHolding({ holdingsBefore: 0, added: 3, signedIn: false }), true, 'a receipt with three items');
  assert.equal(isFirstHolding({ holdingsBefore: 2, added: 1, signedIn: false }), false, 'the stack already had holdings');
  assert.equal(isFirstHolding({ holdingsBefore: 0, added: 0, signedIn: false }), false, 'an import whose rows were all duplicates');
});

test("a signed-in account's add counts only once its cloud stack has been read", () => {
  assert.equal(isFirstHolding({ holdingsBefore: 0, added: 1, signedIn: true, cloudStackRead: true }), true);
  assert.equal(
    isFirstHolding({ holdingsBefore: 0, added: 1, signedIn: true, cloudStackRead: false }),
    false,
    'an empty screen may be a sync that has not landed yet',
  );
});

test('the offer shows once everything is in place', () => {
  assert.equal(freeWeekOfferBlocker(ready()), null);
  assert.equal(FREE_WEEK_OFFER_KEY, 'stack_free_week_offer_shown');
  assert.ok(FREE_WEEK_OFFER_DELAY_MS >= 1000, 'the stack value shows first');
});

test('once shown it never shows again, and nothing shows before the flag is read', () => {
  assert.equal(freeWeekOfferBlocker(ready({ shownBefore: true })), 'shown-before');
  assert.equal(freeWeekOfferBlocker(ready({ shownBefore: null })), 'flag-unknown');
  assert.equal(freeWeekOfferBlocker(ready({ shownBefore: undefined })), 'flag-unknown');
});

test('only after a first holding the person added or an answer from Troy', () => {
  assert.equal(freeWeekOfferBlocker(ready({ firstHoldingAdded: false })), 'no-moment');
  assert.equal(freeWeekOfferBlocker(ready({ firstHoldingAdded: false, troyAnswered: false })), 'no-moment');
});

// The other moment: Troy has just answered someone who hasn't added a
// holding, and they're still in the chat with nothing going on.
function troyReady(overrides = {}) {
  return ready({
    firstHoldingAdded: false,
    troyAnswered: true,
    screen: 'TroyChat',
    livePrices: false,
    stackValue: 0,
    troyBusy: false,
    ...overrides,
  });
}

test("after Troy's answer it shows in the chat, with no stack needed", () => {
  assert.equal(freeWeekOfferBlocker(troyReady()), null);
  assert.equal(freeWeekOfferBlocker(troyReady({ guest: true })), null);
  assert.ok(FREE_WEEK_OFFER_TROY_DELAY_MS > FREE_WEEK_OFFER_DELAY_MS, 'the answer gets read first');
});

test("Troy's moment waits while the chat is busy and only shows in the chat", () => {
  assert.equal(freeWeekOfferBlocker(troyReady({ troyBusy: true })), 'troy-busy');
  assert.equal(freeWeekOfferBlocker(troyReady({ screen: 'Dashboard' })), 'not-troy-chat');
  assert.equal(freeWeekOfferBlocker(troyReady({ screen: 'MyStack' })), 'not-troy-chat');
});

test("Troy's moment keeps every other rule", () => {
  assert.equal(freeWeekOfferBlocker(troyReady({ shownBefore: true })), 'shown-before');
  assert.equal(freeWeekOfferBlocker(troyReady({ goldScreenSeen: true })), 'gold-screen-seen', 'the free limit opened Gold');
  assert.equal(freeWeekOfferBlocker(troyReady({ paid: true })), 'gold');
  assert.equal(freeWeekOfferBlocker(troyReady({ trial: null })), 'no-trial');
  assert.equal(freeWeekOfferBlocker(troyReady({ demo: true })), 'demo');
  assert.equal(freeWeekOfferBlocker(troyReady({ mainScreen: false })), 'not-ready');
  assert.equal(freeWeekOfferBlocker(troyReady({ sheets: { aiConsent: true } })), 'sheet:aiConsent');
  assert.equal(freeWeekOfferBlocker(troyReady({ alertOpen: true })), 'alert');
  assert.equal(freeWeekOfferBlocker(troyReady({ appActive: false })), 'app-inactive');
});

test('the moment follows the screen when both have happened', () => {
  const both = { firstHoldingAdded: true, troyAnswered: true };
  assert.equal(freeWeekOfferMoment({ ...both, screen: 'Dashboard' }), 'holding');
  assert.equal(freeWeekOfferMoment({ ...both, screen: 'TroyChat' }), 'troy');
  assert.equal(freeWeekOfferMoment({ ...both, screen: 'Analytics' }), null);
  assert.equal(freeWeekOfferMoment({ firstHoldingAdded: true, screen: 'TroyChat' }), null);
  assert.equal(freeWeekOfferBlocker(ready({ troyAnswered: true, screen: 'TroyChat' })), null, 'in the chat after both');
  assert.equal(freeWeekOfferBlocker(ready({ troyAnswered: true, screen: 'Analytics' })), 'not-dashboard');
  assert.equal(freeWeekOfferBlocker(ready({ troyBusy: true })), null, "a busy chat doesn't hold the dashboard's moment");
});

test("after Troy's answer the lead names the free limit truthfully", () => {
  const copy = freeWeekOfferCopy(WEEK, { moment: 'troy' });
  assert.equal(TROY_FREE_DAILY_QUESTIONS, 3);
  assert.equal(copy.lead, "Free accounts get 3 questions to Troy a day. Here's what Gold adds.");
  assert.doesNotMatch(copy.lead, /stack/, "they haven't started one");
  assert.deepEqual(copy.points, freeWeekOfferCopy(WEEK).points);
  assert.equal(copy.title, 'Try Gold free for a week');
  assert.equal(freeWeekOfferCopy(WEEK, { moment: 'troy', guest: true }).restore, 'Already have Gold? Restore purchases');
});

test('a guest gets it too, since every new install opens as a guest', () => {
  assert.equal(freeWeekOfferBlocker(ready({ guest: true })), null);
});

test('a Gold screen opened this session cancels it', () => {
  assert.equal(freeWeekOfferBlocker(ready({ goldScreenSeen: true })), 'gold-screen-seen');
});

test('it waits until every place a plan could show has answered', () => {
  assert.equal(freeWeekOfferBlocker(ready({ planKnown: false })), 'plan-unknown');
});

test('never for Gold or Lifetime, and only with a trial this Apple ID can get', () => {
  assert.equal(freeWeekOfferBlocker(ready({ paid: true })), 'gold');
  assert.equal(freeWeekOfferBlocker(ready({ trial: null })), 'no-trial');
  assert.equal(freeWeekOfferBlocker(ready({ trial: undefined })), 'no-trial', 'not checked yet');
});

test('only on the dashboard, past the loading and lock screens, with the live value showing', () => {
  assert.equal(freeWeekOfferBlocker(ready({ demo: true })), 'demo');
  assert.equal(freeWeekOfferBlocker(ready({ mainScreen: false })), 'not-ready');
  assert.equal(freeWeekOfferBlocker(ready({ screen: 'MyStack' })), 'not-dashboard');
  assert.equal(freeWeekOfferBlocker(ready({ screen: 'Analytics' })), 'not-dashboard');
  assert.equal(freeWeekOfferBlocker(ready({ livePrices: false })), 'no-live-prices');
  assert.equal(freeWeekOfferBlocker(ready({ stackValue: 0 })), 'no-value');
  assert.equal(freeWeekOfferBlocker(ready({ stackValue: Number.NaN })), 'no-value');
});

test('never on top of a sheet, the Gold screen, onboarding, the drawer, an alert or a system prompt', () => {
  for (const name of ['gold', 'tutorial', 'aiConsent', 'add', 'scanPreview', 'drawer']) {
    const sheets = { ...ready().sheets, [name]: true };
    assert.equal(freeWeekOfferBlocker(ready({ sheets })), `sheet:${name}`);
  }
  assert.equal(freeWeekOfferBlocker(ready({ sheets: { settings: 'appearance' } })), 'sheet:settings', 'a settings page is open');
  assert.equal(freeWeekOfferBlocker(ready({ alertOpen: true })), 'alert');
  assert.equal(freeWeekOfferBlocker(ready({ appActive: false })), 'app-inactive');
});

test('a seven day trial reads as a week', () => {
  const copy = freeWeekOfferCopy(WEEK);
  assert.equal(copy.title, 'Try Gold free for a week');
  assert.equal(copy.start, 'Start my free week');
  assert.equal(copy.later, 'Not now');
});

test('other trial lengths are named as they are', () => {
  const month = freeWeekOfferCopy({ count: 1, unit: 'month', cycle: 'monthly' });
  assert.equal(month.title, 'Try Gold free for a month');
  assert.equal(month.start, 'Start my free month');
  const twoWeeks = freeWeekOfferCopy({ count: 14, unit: 'day', cycle: 'yearly' });
  assert.equal(twoWeeks.title, 'Try Gold free for 14 days');
  assert.equal(twoWeeks.start, 'Start my free trial');
  assert.doesNotMatch(`${twoWeeks.title} ${twoWeeks.start}`, /week/);
  assert.equal(freeWeekOfferCopy({ count: 3, unit: 'month' }).title, 'Try Gold free for 3 months');
});

test("what Gold adds, as the server and the Gold screen have it", () => {
  // troystack-api: the morning brief goes to Gold and Lifetime profiles; Troy
  // allows 30 questions a day and 20 voice uses a day that spoken questions
  // and answers share, so the sheet counts voice uses, not answers; price
  // history only loads with Gold in the app; Gold skips the free 5 scans a month.
  const { lead, points } = freeWeekOfferCopy(WEEK);
  assert.equal(lead, "Now that you've started your stack, here's what Gold adds.");
  assert.deepEqual(points, [
    'A brief each morning on the metals and your stack',
    'Up to 30 questions to Troy a day and 20 voice uses, spoken questions and answers together',
    'Price history charts for gold, silver, platinum and palladium',
    'Unlimited receipt scans',
  ]);
  assert.match(points[1], new RegExp(`^Up to ${TROY_GOLD_DAILY_QUESTIONS} questions`));
  assert.match(points[1], new RegExp(`${TROY_GOLD_DAILY_VOICE} voice uses, spoken questions and answers together`));
  // A spoken question uses the same 20, so the sheet never promises 20 answers.
  assert.doesNotMatch(points[1], /answers read out loud/);
  assert.doesNotMatch(points.join(' '), /unlimited (questions|troy|voice)/i);
});

test('a signed-in account gets no Restore line and no account wording', () => {
  assert.equal(freeWeekOfferCopy(WEEK).restore, null);
  assert.doesNotMatch(JSON.stringify(freeWeekOfferCopy(WEEK)), /account/);
});

test('a guest gets a Restore line, so a Lifetime from an earlier install is one tap away', () => {
  const copy = freeWeekOfferCopy(WEEK, { guest: true });
  assert.equal(copy.restore, 'Already have Gold? Restore purchases');
  assert.equal(copy.title, 'Try Gold free for a week');
});

test('no long dashes or exclamation marks in anything a person reads', () => {
  const longDash = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
  for (const trial of [WEEK, { count: 1, unit: 'month' }, { count: 14, unit: 'day' }]) {
    for (const moment of ['holding', 'troy']) {
      const copy = freeWeekOfferCopy(trial, { guest: true, moment });
      for (const s of [copy.title, copy.lead, ...copy.points, copy.start, copy.later, copy.restore]) {
        assert.doesNotMatch(s, longDash, s);
        assert.doesNotMatch(s, /!/, s);
      }
    }
  }
});

// A stand-in for React Native's Alert that records what it was asked to show.
function fakeAlert() {
  const calls = [];
  return {
    calls,
    alert(title, message, buttons, options) {
      calls.push({ title, message, buttons, options });
    },
  };
}

test('an alert counts as open until one of its buttons is pressed', () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  const heard = [];
  watch.subscribe((open) => heard.push(open));
  let pressed = 0;
  const own = () => { pressed += 1; };
  const buttons = [{ text: 'Great!', onPress: own }];
  Alert.alert('Items Added Successfully', 'Added 1 item from receipt', buttons);
  assert.equal(watch.isOpen(), true);
  const shown = Alert.calls[0].buttons;
  assert.equal(shown.length, 1);
  assert.equal(shown[0].text, 'Great!');
  assert.equal(buttons[0].onPress, own, "the caller's buttons are left as they were");
  shown[0].onPress();
  assert.equal(pressed, 1);
  assert.equal(watch.isOpen(), false);
  assert.deepEqual(heard, [true, false]);
});

test('an alert opened from another alert keeps the count open in between', () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  const heard = [];
  watch.subscribe((open) => heard.push(open));
  Alert.alert('Clear All Data', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', style: 'destructive', onPress: () => Alert.alert('Done', 'Cleared') },
  ]);
  Alert.calls[0].buttons[1].onPress();
  assert.equal(watch.isOpen(), true, 'the second alert is up');
  assert.deepEqual(heard, [true], 'never heard as closed while one replaced the other');
  Alert.calls[1].buttons[0].onPress();
  assert.equal(watch.isOpen(), false);
  assert.deepEqual(heard, [true, false]);
});

test("an alert without buttons gets React Native's single OK, and pressing it closes", () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  Alert.alert('Saved');
  const { buttons } = Alert.calls[0];
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].text, 'OK');
  assert.equal(buttons[0].style, 'cancel');
  assert.equal(watch.isOpen(), true);
  buttons[0].onPress();
  assert.equal(watch.isOpen(), false);
  Alert.alert('Saved', undefined, []);
  assert.equal(Alert.calls[1].buttons[0].text, 'OK', 'an empty list too');
});

test('an Android dismissal closes it, and the caller still hears its own onDismiss', () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  let dismissed = 0;
  Alert.alert('Sync', 'Try again later', [{ text: 'OK' }], { cancelable: true, userInterfaceStyle: 'dark', onDismiss: () => { dismissed += 1; } });
  const { options } = Alert.calls[0];
  assert.equal(options.cancelable, true);
  assert.equal(options.userInterfaceStyle, 'dark');
  options.onDismiss();
  assert.equal(dismissed, 1);
  assert.equal(watch.isOpen(), false);
});

test('each alert closes once, however many ways it reports closing', () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  Alert.alert('First', '', [{ text: 'OK' }]);
  Alert.alert('Second', '', [{ text: 'OK' }]);
  const first = Alert.calls[0];
  first.buttons[0].onPress();
  first.options.onDismiss();
  first.buttons[0].onPress();
  assert.equal(watch.isOpen(), true, 'the second is still up');
  Alert.calls[1].buttons[0].onPress();
  assert.equal(watch.isOpen(), false);
});

test("a button's own arguments, return value and errors pass through, and it still closes", () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  let got;
  Alert.alert('Name', '', [{ text: 'OK', onPress: (value) => { got = value; return 'kept'; } }]);
  assert.equal(Alert.calls[0].buttons[0].onPress('typed'), 'kept');
  assert.equal(got, 'typed');
  assert.equal(watch.isOpen(), false);
  Alert.alert('Oops', '', [{ text: 'OK', onPress: () => { throw new Error('handler failed'); } }]);
  assert.throws(() => Alert.calls[1].buttons[0].onPress(), /handler failed/);
  assert.equal(watch.isOpen(), false);
});

test('an alert that fails to show does not stay counted', () => {
  const Alert = { alert() { throw new Error('no native module'); } };
  const watch = watchAlerts(Alert);
  assert.throws(() => Alert.alert('x'), /no native module/);
  assert.equal(watch.isOpen(), false);
});

test('a Fast Refresh that loads this file again still wraps once', async () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  const reloaded = await import(`./freeWeekOffer.js?refresh=${Date.now()}`);
  assert.notEqual(reloaded.watchAlerts, watchAlerts, 'a fresh copy of the module');
  assert.equal(reloaded.watchAlerts(Alert), watch, 'finds the first wrap');
  Alert.alert('Once', '', [{ text: 'OK' }]);
  assert.equal(Alert.calls.length, 1);
  Alert.calls[0].buttons[0].onPress();
  assert.equal(watch.isOpen(), false, 'one wrapper, one count');
});

test('watching twice wraps once, and unsubscribing stops the updates', () => {
  const Alert = fakeAlert();
  const watch = watchAlerts(Alert);
  assert.equal(watchAlerts(Alert), watch);
  const heard = [];
  const stop = watch.subscribe((open) => heard.push(open));
  Alert.alert('One', '', [{ text: 'OK' }]);
  assert.equal(Alert.calls.length, 1, 'shown once, not through two wrappers');
  stop();
  Alert.calls[0].buttons[0].onPress();
  assert.equal(watch.isOpen(), false);
  assert.deepEqual(heard, [true]);
});
