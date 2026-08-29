# Declarative database schema

- Status: Accepted
- Date: 2026-08-29

## Context

The repository already keeps ordered Supabase SQL migrations, but migration history alone makes the
current database shape harder to understand as the schema grows. Routine schema work should begin
from a reviewed desired state and generate the SQL needed to move each environment forward. The
database also relies on PostgreSQL-specific features such as RLS, grants, triggers, and functions.

## Decision

- Files under `supabase/schemas/` are the declarative source of truth for supported database
  objects.
- Files under `supabase/migrations/` remain the immutable, ordered deployment history.
- Developers edit the declarative schema first and run `pnpm supabase:schema:diff --name <name>` to
  generate a migration. Every generated migration must be reviewed before it is committed or applied.
- Applied migrations are never regenerated, renamed, or edited. A later schema change produces a new
  forward migration.
- Data backfills, staged transformations, and objects that the schema diff cannot represent use an
  explicit additive migration while keeping the declarative end state current.
- Supabase CLI remains the sole migration authority. Prisma, Atlas, and other schema managers are not
  introduced unless a future application requirement justifies replacing this ownership model.
- Hosted database schema changes do not happen through Studio or the SQL editor. Manual SQL remains
  limited to documented operator actions such as first-admin bootstrap and recovery.

## Consequences

The desired schema and the migration history intentionally represent different concerns: one shows
the current target state, while the other records how deployed databases reach it. CI continues to
apply migrations to a fresh local Supabase database, reject declarative drift through a strict schema
diff, and test security behavior. Generated SQL still requires human review, especially for
destructive changes, renames, and data-preserving transitions.

The first template models `public.admin_audit_logs` and its indexes, grants, RLS posture, trigger, and
functions. Product or tenant-owned tables are deferred until the product domain and ownership rules
are defined.

## Revisit conditions

Reconsider the tooling only if the application adopts a direct database ORM/query layer that needs
its own generated client, or if Supabase's declarative diff cannot represent a material part of the
PostgreSQL schema. Any replacement must define one migration authority and a safe transition for
existing history.

See [Supabase declarative database schemas](https://supabase.com/docs/guides/local-development/declarative-database-schemas).
