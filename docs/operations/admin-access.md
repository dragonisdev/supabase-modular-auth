# Admin access

The first admin must be bootstrapped manually because no existing account can authorize the change. Register and confirm the account, copy its UUID from Supabase Authentication > Users, then use the reviewed operator queries:

- [`promote_user_to_admin.sql`](../../supabase/queries/admin/promote_user_to_admin.sql) promotes the user after its fail-closed `null::uuid` sentinel is replaced in a temporary copy.
- [`inspect_user_metadata.sql`](../../supabase/queries/admin/inspect_user_metadata.sql) verifies the resulting application metadata and returns no rows until its sentinel is replaced.

Confirm that the update changes exactly one row. Never commit a real user UUID or run the update against an unverified account.

After bootstrap, the existing admin users screen and backend admin API can promote another user by setting `role` to `admin`; authorization is enforced from server-verified Supabase `app_metadata`.

The planned `superadmin` distinction and long-term delegation rules are recorded in [Admin role delegation](../decisions/admin-role-delegation.md).
