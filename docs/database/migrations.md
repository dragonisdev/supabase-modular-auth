# Database migrations and operations

`supabase/` is the conventional Supabase CLI project and the canonical home for database workflow SQL. The current migration creates durable, service-role-only admin audit logging with RLS, append-only controls, and explicit function privileges.

```text
supabase/
├─ queries/admin/                     # Manual, fail-closed operator queries
├─ config.toml                        # Secret-free local project configuration
├─ schemas/
│  └─ admin_audit_logs.sql            # Declarative desired state
├─ migrations/
│  └─ 20260311000000_admin_audit_logs.sql
└─ tests/admin_audit_logs.test.sql    # pgTAP security checks
```

## Declarative schema workflow

Treat `supabase/schemas/` as the source of truth for the desired database shape. Edit those
files instead of making schema changes in Studio or the hosted SQL editor, then generate a migration:

```bash
pnpm supabase:schema:diff -f describe_the_change
```

Review the generated file under `supabase/migrations/`, paying particular attention to drops,
renames, locks, and data preservation. The declarative files show the target state; the immutable
migrations remain the only artifacts applied to shared environments. Data backfills and changes not
captured by schema diff still require a reviewed, additive migration.

The decision and revisit conditions are recorded in [Declarative database schema](../decisions/declarative-database-schema.md).

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

Set both `TEST_DATABASE_URL` and `ALLOW_DATABASE_CLUSTER_MUTATIONS=true` to include behavior tests. The explicit opt-in is required because the runner creates and drops a random disposable database and may temporarily create missing Supabase-compatible cluster roles. It never alters an existing role and removes roles it created, but still requires a local or otherwise dedicated cluster whose login has `CREATEDB`. Never point it at a shared or production cluster.

## Link and initialize a hosted Supabase project

Do this only after the local migration, lint, and pgTAP checks pass. Linking and pushing are explicit
operator actions: the default CI workflow validates against disposable local infrastructure and never
logs in to Supabase, links a hosted project, or applies remote migrations.

1. Confirm the target Supabase organization, project name, environment, and project reference. Use a
   separate project for each environment.
2. Authenticate the repository-pinned CLI. Enter the personal access token at the prompt; never put it
   in a command, environment example, log, or committed file:

   ```bash
   pnpm exec supabase login
   ```

3. Link this repository's Supabase project to the intended hosted project:

   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   ```

   The local link metadata is stored under the ignored `supabase/.temp/` directory. Linking
   does not apply migrations.

4. Inspect local and remote migration history, then preview the pending remote changes:

   ```bash
   pnpm exec supabase migration list
   pnpm exec supabase db push --dry-run
   ```

   For a new project, the dry run should contain only the reviewed repository migrations. If the
   project already contains application-owned schema or its migration history differs, stop and
   reconcile it deliberately. Do not use `migration repair`, `db pull`, or `--include-all` as an
   automatic fix.

5. Apply the reviewed pending migrations, without seed data:

   ```bash
   pnpm exec supabase db push
   ```

6. Run `migration list` again and verify that local and hosted histories agree. Confirm that
   `public.admin_audit_logs` exists, then exercise the application verification checklist in
   [Setup](../setup.md#verification-checklist).

Only one operator or release job should push migrations to a given project at a time. For later
releases, apply backward-compatible migrations before deploying code that requires them. Never run a
database reset against a shared or production project.

## Migration rules

- Use `YYYYMMDDHHmmss_description.sql`; the 14-digit prefix is the migration identity.
- Once a migration reaches any shared environment, never edit, rename, reuse its timestamp, or reorder it. Add a later migration.
- Enable RLS on every application table in `public` and grant only the minimum role privileges.
- Add seeded two-tenant behavioral isolation tests with the first real tenant-owned schema. The starter intentionally has no fictional tenant table today.
- Never use a seed or migration to promote an administrator.

Linking a project, applying a remote migration, repairing migration history, or resetting a database
is an explicit operator action and is never part of ordinary tests.

## Manual operator queries

Files under `supabase/queries/` are not discovered by the Supabase migration runner. Run them only after reviewing and replacing their `null::uuid` sentinel in a temporary copy.

- [`inspect_user_metadata.sql`](../../supabase/queries/admin/inspect_user_metadata.sql) is read-only and returns no rows by default.
- [`promote_user_to_admin.sql`](../../supabase/queries/admin/promote_user_to_admin.sql) fails by default, preserves existing metadata, and rolls back unless exactly one user is updated.

Operator queries must contain no live UUIDs, email addresses, access tokens, or environment-specific values. Do not copy them into migrations or seeds.
