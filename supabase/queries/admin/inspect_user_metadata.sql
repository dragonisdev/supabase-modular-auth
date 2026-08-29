-- Manual, read-only operator query.
-- Replace null::uuid with a reviewed user UUID before running in the Supabase SQL editor.
-- The committed default intentionally returns no rows.

with parameters as (
  select null::uuid as target_user_id
)
select users.id, users.email, users.raw_app_meta_data
from auth.users as users
cross join parameters
where parameters.target_user_id is not null
  and users.id = parameters.target_user_id;
