-- Close lints 0028 and 0029 from the Supabase security advisor.
--
-- handle_new_user() and rls_auto_enable() are SECURITY DEFINER functions in
-- the public schema, and the advisor flags them as executable by anon and
-- authenticated through /rest/v1/rpc. As trigger functions they can't run
-- that way, but nothing should be able to try. Postgres doesn't check EXECUTE
-- when a trigger or event trigger fires its function, so the sign-up trigger
-- that writes the profile row keeps working.
--
-- Apply it by hand in the Supabase SQL editor after a backup. Don't run
-- `supabase db push` from this repo, since troystack-api's numbered
-- migrations own the project's migration history.
--
-- Then check it took. Each of these should return false:
--   select has_function_privilege('anon', 'public.handle_new_user()', 'execute');
--   select has_function_privilege('authenticated', 'public.handle_new_user()', 'execute');
--   select has_function_privilege('anon', 'public.rls_auto_enable()', 'execute');
--   select has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute');
-- Sign up a fresh test account and check its profiles row exists, and rerun
-- the security advisor to see 0028 and 0029 gone.
--
-- A later DROP and CREATE of either function brings the grants back through
-- Supabase's default privileges, so it needs these lines again.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
