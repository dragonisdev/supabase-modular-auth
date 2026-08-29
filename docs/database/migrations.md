# Database migrations

The current SQL migration creates durable, service-role-only admin audit logging with RLS and append-only controls.

The migration source is:

```text
backend/supabase/migrations/20260311_admin_audit_logs.sql
```

For the current fresh-project workflow, open Supabase Dashboard -> SQL Editor, paste that file's contents, and run it once. Then run `pnpm test:database` locally against disposable PostgreSQL or rely on the CI database job for structural validation. The repository does not yet define a canonical Supabase CLI work directory, so do not run `supabase db push` from an assumed path.

Apply migrations to a fresh Supabase project before relying on the admin audit feed. Do not edit an already-applied migration; add a new timestamped migration.

## Validation

```bash
pnpm test:database
```

Without `TEST_DATABASE_URL`, static policy checks still run. CI additionally applies every migration twice to disposable PostgreSQL and verifies RLS/grants, real role behavior, append-only triggers, and retention.

Vanilla PostgreSQL validation does not reproduce Supabase Auth, PostgREST, extensions, or JWT-derived claims. Supabase-specific behavior should also be validated with the Supabase CLI once the repository has a canonical CLI work directory.

Never use seed data to auto-promote an admin. Admin bootstrap is environment-specific and should use an explicit placeholder/parameterized operational query.
