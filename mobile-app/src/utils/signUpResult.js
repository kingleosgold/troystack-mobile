/**
 * TroyStack - what an email sign up does next
 *
 * With Confirm email off in Supabase Auth, signUp hands back a session and
 * the new account is signed in on the spot. Telling that person to check
 * their email for a link that never comes is false, and it skipped the
 * post sign in sync screen a guest's stack waits on. With Confirm email on,
 * there's no session until the link is opened, and the email alert is true.
 */

export function signUpNextStep(result) {
  if (result?.error) return 'error';
  return result?.session ? 'signedIn' : 'checkEmail';
}
