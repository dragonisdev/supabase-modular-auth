# Testing

Run the deterministic mocked, static, and contract suite from the repository root:

```bash
pnpm test
pnpm test:type-check
pnpm test:coverage
```

Prefer tests that fail when a meaningful behavior changes: authorization decisions, token and
password boundaries, session rotation, cookie security, and error classification. Use table-driven
cases for related boundaries and share repeated setup. Avoid assertions on exact documentation
wording, historical file inventories, or implementation source strings when an executable check
already covers the behavior. Keep API contracts, broken-link checks, and deployment security
invariants where they protect a separate failure mode.

Run mutation testing to assess those assertions with Node.js 24.11+ or the supported 22.18+ line
(Stryker's Babel dependency requires these versions):

```bash
pnpm test:mutation
pnpm test:mutation --mutate backend/src/services/session.service.ts
```

Stryker changes production code in a temporary `.stryker-tmp/` copy and runs the relevant Vitest
tests. The default scope is session resolution, authentication middleware, auth cookies, and backend
password strength. The mutation Vitest configuration includes only unit tests and mocked Express
security tests, even when live-test environment variables are set. It does not run Redis,
PostgreSQL, or live Supabase tests. HTML and JSON reports are written under `coverage/mutation/`;
`pnpm test:coverage` clears that directory, so run coverage before mutations when retaining both.

Review surviving mutants for missing behavioral assertions or equivalent changes before adding
tests. A surviving log-message mutation alone is not a reason to freeze prose. The mutation score
applies only to the four configured files, not the whole repository. Mutation testing is an explicit
local command; the regular CI coverage gate remains in place.

The command fails below a 75% mutation score. On the initial four-file review, the original suite
scored 44.29%; boundary and failure-path assertions raised it above 75% without changing production
code. Keep the floor meaningful as the configured scope grows; do not exclude surviving mutants
solely to improve the number.

`test/database/migration-policy.test.ts` always checks migration and RLS invariants. Set `TEST_DATABASE_URL` to create a randomly named disposable database, apply each migration once, verify grants, real role behavior, RLS, triggers, and retention, then drop that database:

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
