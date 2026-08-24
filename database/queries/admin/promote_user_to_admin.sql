-- Manual, security-sensitive operator query.
-- Replace null::uuid with a reviewed user UUID before running in the Supabase SQL editor.
-- The committed default fails before changing data.

do $$
declare
  target_user_id uuid := null::uuid;
  affected_rows integer := 0;
begin
  if target_user_id is null then
    raise exception 'Set target_user_id before running this query';
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'admin', 'is_admin', true)
  where id = target_user_id;

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception 'Expected to update exactly one user, updated %', affected_rows;
  end if;

  raise notice 'Promoted user % to admin', target_user_id;
end
$$;
