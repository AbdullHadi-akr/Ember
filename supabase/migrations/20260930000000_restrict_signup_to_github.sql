-- Only allow new accounts to be created through GitHub OAuth.
-- Existing email/password users can still sign in, because this hook
-- only runs when a new user is about to be created.
--
-- After running this, enable it in the dashboard:
-- Authentication > Hooks > "Before User Created" > Postgres function
-- > public.hook_restrict_signup_to_github

create or replace function public.hook_restrict_signup_to_github(event jsonb)
returns jsonb
language plpgsql
as $$
declare
	signup_provider text := event->'user'->'app_metadata'->>'provider';
begin
	if signup_provider is distinct from 'github' then
		return jsonb_build_object(
			'error', jsonb_build_object(
				'http_code', 403,
				'message', 'New accounts can only be created with GitHub.'
			)
		);
	end if;

	return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_restrict_signup_to_github(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup_to_github(jsonb) from authenticated, anon, public;
