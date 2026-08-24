# Database migrations and operations

`database/` is the Supabase CLI workdir and the only tracked SQL root. The current migration creates durable, service-role-only admin audit logging with RLS, append-only controls, and explicit function privileges.

```text
database/
├─ queries/admin/                     # Manual, fail-closed operator queries
└─ supabase/
   ├─ config.toml                     # Secret-free local project configuration
   ├─ migrations/
   │  └─ 20260311000000_admin_audit_logs.sql
   └─ tests/admin_audit_logs.test.sql # pgTAP security checks
```

## Local Supabase validation

With Docker running, use the pinned Supabase CLI from the repository:

```bash
pnpm supabase:start
pnpm supabase:lint
pnpm supabase:test
pnpm supabase:stop
```

`supabase:start` starts the local PostgreSQL service and applies the migrations. Lint checks PL/pgSQL in `public`; the pgTAP suite verifies RLS, grants, function privileges, fixed search paths, and the append-only trigger. No hosted credentials are needed.

The deterministic test suite also enforces layout, timestamp, RLS, and query-safety policy without Docker:

```bash
pnpm test:database
```

Set both `TEST_DATABASE_URL` and `ALLOW_DATABASE_CLUSTER_MUTATIONS=true` to include behavior tests. The explicit opt-in is required because the runner creates and drops a random disposable database and may temporarily create or adjust Supabase-compatible cluster roles. It restores existing role state and removes roles it created, but still requires a local or otherwise dedicated cluster whose login has `CREATEDB`. Never point it at a shared or production cluster.

## Migration rules

- Use `YYYYMMDDHHmmss_description.sql`; the 14-digit prefix is the migration identity.
- Once a migration reaches any shared environment, never edit, rename, reuse its timestamp, or reorder it. Add a later migration.
- Enable RLS on every application table in `public` and grant only the minimum role privileges.
- Add seeded two-tenant behavioral isolation tests with the first real tenant-owned schema. The starter intentionally has no fictional tenant table today.
- Never use a seed or migration to promote an administrator.

For a fresh hosted project, review the pending files before using the CLI's link and push workflow. Linking a project, applying a remote migration, repairing migration history, or resetting a database is an explicit operator action and is never part of ordinary tests.

## Manual operator queries

Files under `database/queries/` are not discovered by the Supabase migration runner. Run them only after reviewing and replacing their `null::uuid` sentinel in a temporary copy.

- [`inspect_user_metadata.sql`](../../database/queries/admin/inspect_user_metadata.sql) is read-only and returns no rows by default.
- [`promote_user_to_admin.sql`](../../database/queries/admin/promote_user_to_admin.sql) fails by default, preserves existing metadata, and rolls back unless exactly one user is updated.

Operator queries must contain no live UUIDs, email addresses, access tokens, or environment-specific values. Do not copy them into migrations or seeds.
