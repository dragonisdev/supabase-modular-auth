# Contracts and data boundaries

## Shared TypeScript contracts

`types/src/` exports Zod schemas and response/error types used by both application packages. Generated OpenAPI types live under `types/src/generated/` and are checked for drift in CI.

The backend may add stricter validation than the browser. For example, password strength scoring remains server-side.

## HTTP contract

`docs/api/openapi.yaml` is the canonical operation and payload description. Contract tests compare it with Express route definitions and verify security requirements. Run:

```bash
pnpm api:generate
pnpm api:check
```

The current tests validate specification and route drift; they do not yet perform runtime schema validation for every response.

## Database boundary

Supabase Auth owns identity tables. The application does not introduce custom password/auth tables. `database/supabase/schemas/` is the declarative source of truth, `database/supabase/migrations/` is the canonical ordered deployment history, and `database/queries/` contains manual, fail-closed operator tools that are never applied automatically. The current schema covers durable admin audit logging and enforces RLS, grants, and append-only behavior.

There is no tenant-owned product table yet. Static tests require future `tenant_id` tables to enable RLS and define tenant-aware policies; real seeded cross-tenant behavior tests must arrive with the first such schema.

See [Database migrations](../database/migrations.md) and [Testing](../testing.md).
