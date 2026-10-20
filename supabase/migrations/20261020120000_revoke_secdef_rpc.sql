-- Close lints 0028 and 0029 from the Supabase security advisor.
--
-- handle_new_user() and rls_auto_enable() are SECURITY DEFINER functions in
-- the public schema, so PostgREST exposes them at /rest/v1/rpc to anyone
-- holding the anon key. Neither is meant to be called that way. Postgres
-- doesn't check EXECUTE when a trigger or event trigger fires its function,
-- so the sign-up trigger that writes the profile row keeps working.
--
-- Apply in the Supabase SQL editor or with `supabase db push` after a backup.
-- Then sign up a fresh test account and check its profiles row exists.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
