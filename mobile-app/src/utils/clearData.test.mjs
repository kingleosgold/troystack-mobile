// Run with: node --test mobile-app/src/utils/clearData.test.mjs
// Clear All Data left dataLoaded false until relaunch, so nothing saved and
// a sign in after the wipe stuck on the loading screen. A signed-in wipe
// also let the next sync pull the cloud stack straight back. The App.js
// checks read the source, since App.js isn't under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearDataPrompt, clearDataDone } from './clearData.js';

const app = readFileSync(new URL('../../App.js', import.meta.url), 'utf8');

function slice(start, end) {
  const a = app.indexOf(start);
  const b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `${start} not found`);
  return app.slice(a, b);
}

test('a reset never sets dataLoaded back to false', () => {
  const reset = slice('const resetAllState = (fullReset = true) => {', 'const clearAllData = async () => {');
  assert.doesNotMatch(reset, /setDataLoaded\(false\)/);
  assert.doesNotMatch(app, /setDataLoaded\(false\)/);
});

test('a signed-in wipe signs out before it clears the phone', () => {
  const clear = slice('const clearAllData = async () => {', 'const performSignOut = async () => {');
  const signOut = clear.indexOf('if (signedIn && !(await performSignOut())) return;');
  assert.ok(signOut >= 0);
  assert.ok(signOut < clear.indexOf('await AsyncStorage.clear();'));
  assert.match(clear, /clearDataDone\(signedIn\)/);
});

test('the words tell a signed-in user the cloud copy stays', () => {
  assert.match(clearDataPrompt(true), /on this phone/);
  assert.match(clearDataPrompt(true), /signs you out/);
  assert.match(clearDataPrompt(true), /cloud copy stays/);
  assert.match(clearDataDone(true), /signed out/);
  assert.equal(clearDataPrompt(false), 'Are you sure? This will permanently delete all your holdings and settings.');
  assert.equal(clearDataDone(false), 'All your data has been erased. The app has been reset to its initial state.');
  assert.match(app, /clearDataPrompt\(!!supabaseUser\),/);
});

test('a reset turns iCloud sync off so an empty stack never goes up over a backup', () => {
  const reset = slice('const resetAllState = (fullReset = true) => {', 'const clearAllData = async () => {');
  const off = reset.indexOf('setICloudSyncEnabled(false);');
  assert.ok(off >= 0);
  assert.ok(off < reset.indexOf('if (fullReset) {'), 'both resets turn it off');
});

test('a guest stays a guest after a wipe', () => {
  const clear = slice('const clearAllData = async () => {', 'const performSignOut = async () => {');
  const after = clear.slice(clear.indexOf('resetAllState();'));
  assert.match(after, /if \(!signedIn\) \{\s*setGuestMode\(true\);\s*AsyncStorage\.multiSet\(\[\[GUEST_MODE_KEY, 'true'\], \[SEEN_FIRST_LAUNCH_KEY, 'true'\]\]\)/);
});

test('a failed sign out clears nothing on the phone', () => {
  const out = slice('const performSignOut = async () => {', 'const formatCurrency = ');
  const failed = out.indexOf('return false;', out.indexOf('if (signOutError) {'));
  assert.ok(failed >= 0 && failed > out.indexOf('await supabaseSignOut();'));
  assert.ok(failed < out.indexOf('AsyncStorage.multiRemove('), 'stops before the local clear');
  assert.ok(failed < out.indexOf('resetAllState(false);'), 'stops before the reset');
  assert.match(out, /setGuestMode\(false\);\s*return true;/);
});

test('the auth context reports a failed sign out', () => {
  const context = readFileSync(new URL('../contexts/AuthContext.tsx', import.meta.url), 'utf8');
  assert.match(context, /signOut: \(\) => Promise<\{ error: Error \| null \}>;/);
  const start = context.indexOf('const signOut = useCallback(');
  const body = context.slice(start, context.indexOf('const resetPassword = useCallback(', start));
  assert.match(body, /return \{ error: error \?\? null \};/);
});

test('a failed sign out leaves the plan as it was', () => {
  const out = slice('const performSignOut = async () => {', 'const formatCurrency = ');
  const signOut = out.indexOf('await supabaseSignOut();');
  assert.ok(signOut >= 0);
  assert.match(out, /if \(signOutError\) return false;/);
  // Nothing about the account's plan changes until the sign out took
  for (const step of ['webPlanGenRef.current += 1;', "rcPlanRef.current = { rcGold: false", 'storePlanRef.current = null;',
    'signedInIdRef.current = null;', 'applyWebPlan(null);', 'claimStoreSync.reset();', 'await withTimeout(logoutRevenueCat(), WEB_PLAN_TIMEOUT_MS);']) {
    const at = out.indexOf(step);
    assert.ok(at > signOut, `${step} runs after the sign out`);
  }
  assert.doesNotMatch(app, /planSetupRun/);
  // A holdings sync the auto sync restarted during the sign out stops too
  assert.ok(out.indexOf('accountGenRef.current += 1;', signOut) > signOut);
});

test('a deleted account says so when the phone could not sign out', () => {
  const screen = readFileSync(new URL('../screens/AccountScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /const signedOut = await onSignOut\(\);/);
  assert.match(screen, /signedOut === false/);
  assert.match(app, /onSignOut=\{\(\) => performSignOut\(\)\}/);
});

test('the loading screen holds until the sign out has cleared the phone', () => {
  const out = slice('const performSignOut = async () => {', 'const formatCurrency = ');
  assert.ok(out.indexOf('setSigningOut(true);') < out.indexOf('await supabaseSignOut();'));
  assert.match(out, /\} finally \{\s*setSigningOut\(false\);\s*\}\s*\};/);
  assert.match(app, /if \(isLoading \|\| authLoading \|\| signingOut \|\| guestMode === null \|\| needsPostSignInSync\) \{/);
  assert.match(app, /&& !\(isLoading \|\| authLoading \|\| signingOut \|\| guestMode === null \|\| needsPostSignInSync\)/);
});

test('the loading screen holds through a wipe', () => {
  const clear = slice('const clearAllData = async () => {', 'const performSignOut = async () => {');
  assert.ok(clear.indexOf('setSigningOut(true);') < clear.indexOf('await AsyncStorage.clear();'));
  assert.match(clear, /\} finally \{\s*setSigningOut\(false\);\s*\}\s*\};/);
});
