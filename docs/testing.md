# Testing

Run the deterministic mocked, static, and contract suite from the repository root:

```bash
pnpm test
pnpm test:type-check
pnpm test:coverage
```

The default suite mocks Stripe and Supabase at the service boundary. Billing coverage includes the
server-side price allowlist, catalog projection, hosted Checkout parameters, duplicate webhook
idempotency, forced replay bookkeeping, same-origin frontend paths, and the raw-signature/CSRF
boundary. It does not call a live Stripe account.

`test/database/migration-policy.test.ts` always checks migration and RLS invariants, including the service-role-only billing projection. Set `TEST_DATABASE_URL` to create a randomly named disposable database, apply each migration once, verify grants, real role behavior, RLS, triggers, retention, and billing browser-role denial, then drop that database:

```bash
ALLOW_DATABASE_CLUSTER_MUTATIONS=true \
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres \
pnpm test:database
```

The explicit opt-in is required because the database test needs `CREATEDB` and may temporarily create missing `anon`, `authenticated`, or `service_role` cluster roles. It never alters an existing role, removes roles it created, and drops its disposable database. Never point it at a shared or production cluster.

With Docker running, the pinned Supabase CLI also validates the real project layout and local database image:

```bash
pnpm supabase:start
pnpm supabase:schema:check
pnpm supabase:lint
pnpm supabase:test
pnpm supabase:stop
```

The start command applies `supabase/migrations/`; the strict schema check rejects drift between those
migrations and `supabase/schemas/`; lint checks the resulting `public` schema; and the pgTAP suite
verifies database privileges and security properties. The drift checker removes only the temporary
migration it creates. None of these commands uses a hosted project.

Live Supabase auth is opt-in and creates, verifies, refreshes, then deletes a temporary user. Prefer a local or dedicated test project. Remote projects also require `ALLOW_REMOTE_SUPABASE_TESTS=true`:

```bash
RUN_LIVE_SUPABASE_TESTS=true \
SUPABASE_TEST_URL=... \
SUPABASE_TEST_ANON_KEY=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
pnpm test:live
```

There is no tenant-owned product table yet, so a real two-tenant behavioral RLS test would be fictional. The static suite requires RLS and a tenant-aware policy on future tables with `tenant_id`; add seeded isolation tests with the first such schema.

GitHub Actions also runs formatting, linting, workspace/test type checks, OpenAPI and declarative-schema
drift detection, coverage, production package and container builds, Compose validation, pinned
Supabase CLI migration/lint/pgTAP checks, and disposable-database behavior tests.
