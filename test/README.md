# Tests

Run the deterministic mocked and static suite from the repository root:

```bash
pnpm test
pnpm test:type-check
pnpm test:coverage
```

`test/database/migration-policy.test.ts` always checks migration and RLS invariants. Set
`TEST_DATABASE_URL` to run the same migrations twice against a disposable PostgreSQL database and
verify grants, RLS, and append-only audit behavior:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres pnpm test:database
```

Live Supabase auth is opt-in and creates then deletes a temporary verified user. Prefer a local or
dedicated test project. Remote projects also require `ALLOW_REMOTE_SUPABASE_TESTS=true`:

```bash
RUN_LIVE_SUPABASE_TESTS=true \
SUPABASE_TEST_URL=... \
SUPABASE_TEST_ANON_KEY=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
pnpm test:live
```

There is no tenant-owned product table in the starter yet, so a genuine two-tenant behavioral RLS
test would be fictional. The static suite already requires RLS and a policy on any future migration
that creates a table with `tenant_id`; add seeded two-tenant behavioral tests with the first such
schema.
