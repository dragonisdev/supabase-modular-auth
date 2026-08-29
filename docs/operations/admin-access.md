# Admin access

The first admin must be bootstrapped manually because no existing account can authorize the change. Register and confirm the account, copy its UUID from Supabase Authentication > Users, then use one of these examples in the Supabase SQL editor after replacing `<USER_UUID>`:

- [`update_admin.sql`](../../update_admin.sql) promotes the user to admin.
- [`check_metadata.sql`](../../check_metadata.sql) verifies the resulting application metadata.
- [`backend/supabase/example_update_user_admin.sql`](../../backend/supabase/example_update_user_admin.sql) is the colocated backend example.

Confirm that the update changes exactly one row. Never commit a real user UUID or run the update against an unverified account.

After bootstrap, the existing admin users screen and backend admin API can promote another user by setting `role` to `admin`; authorization is enforced from server-verified Supabase `app_metadata`.

The planned `superadmin` distinction and long-term delegation rules are recorded in [Admin role delegation](../decisions/admin-role-delegation.md).
