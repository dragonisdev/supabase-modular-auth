# Supabase

`supabase/` is the canonical Supabase CLI project and the home for database workflow SQL.

```text
supabase/
├─ queries/                 # Manual operator queries; never applied automatically
│  └─ admin/
├─ config.toml              # Secret-free local Supabase configuration
├─ schemas/                 # Declarative desired state; edit these first
├─ migrations/              # Ordered, immutable schema migrations
└─ tests/                   # pgTAP database security tests
```

For schema changes, edit `supabase/schemas/` and generate a migration for review:

```bash
pnpm supabase:schema:diff --name add_projects
```

The schema files describe the desired state; migrations remain the versioned deployment history.
Review generated SQL for destructive operations and data-preserving transitions before committing it.

Run the local migration checks from the repository root:

```bash
pnpm supabase:start
pnpm supabase:lint
pnpm supabase:test
pnpm supabase:stop
```

`supabase:start` requires a running Docker engine. It starts only the local PostgreSQL service and applies `supabase/migrations/` in timestamp order.

Migration filenames use `YYYYMMDDHHmmss_description.sql`. Once a migration has been applied to any shared environment, do not rename, edit, or reorder it; add a later migration instead.

Files under `queries/` are reviewed operational tools, not migrations or seed data. They must default to a no-op or explicit failure, contain no live identifiers, and report whether the intended row was affected. See the [database operations guide](../docs/database/migrations.md) before running one.
