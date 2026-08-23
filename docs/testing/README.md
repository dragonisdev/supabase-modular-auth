# Testing

Run the deterministic mocked, static, and contract suite from the repository root:

```bash
pnpm test
pnpm test:type-check
pnpm test:coverage
```

`test/database/migration-policy.test.ts` always checks migration and RLS invariants. Set `TEST_DATABASE_URL` to run migrations twice against disposable PostgreSQL and verify grants, real role behavior, RLS, triggers, and retention:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test:database
```

The database test creates/alters roles and data. Never point it at a shared or production database.

Live Supabase auth is opt-in and creates, verifies, refreshes, then deletes a temporary user. Prefer a local or dedicated test project. Remote projects also require `ALLOW_REMOTE_SUPABASE_TESTS=true`:

```bash
RUN_LIVE_SUPABASE_TESTS=true \
SUPABASE_TEST_URL=... \
SUPABASE_TEST_ANON_KEY=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
pnpm test:live
```

There is no tenant-owned product table yet, so a real two-tenant behavioral RLS test would be fictional. The static suite requires RLS and a tenant-aware policy on future tables with `tenant_id`; add seeded isolation tests with the first such schema.

GitHub Actions also runs formatting, linting, workspace/test type checks, OpenAPI drift detection, coverage, production package and container builds, Compose validation, and disposable-PostgreSQL migration tests.
