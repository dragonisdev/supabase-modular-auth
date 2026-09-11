# ADR 0002: Manage Railway deployment configuration with IaC

- Status: Accepted; staged for reviewed application
- Date: 2026-09-07

## Context

The repository is a pnpm monorepo. The backend and frontend share the root
workspace manifest, lockfile, and `types/` package, so service-local roots or
backend-only watch paths can skip required deployments. A skipped Railway
deployment was observed with `No changes to watched files`; the backend watch
paths were subsequently corrected in the Railway dashboard and documented in
`docs/deployment/railway.md`.

The current production Railway environment was inspected before this change:

- Railway contains one backend service, `@supabase-modular-auth/backend`.
- The service builds from the repository root with Railpack and deploys from
  `main`.
- Railway injects `PORT=8080`; the running process reported port 8080.
- The service has one replica in `europe-west4-drams3a`, 2 vCPU, 4 GB memory,
  restart-on-failure with ten retries, Serverless enabled, and a generated
  public domain.
- The backend connected to the external Upstash Redis REST store at startup.
- The frontend is currently hosted outside this Railway project, and no
  Railway Redis service is present.

The repository had no Railway Infrastructure as Code definition. Railway's
legacy `railway.json` and `railway.toml` model one service and are deprecated;
the project-level TypeScript definition is the supported replacement.

## Decision

Adopt one root `.railway/railway.ts` file as the code-owned definition for the
Railway project. The first staged definition describes only the existing
backend service and owns the settings that are safe to reproduce from the
verified live configuration:

- GitHub source `dragonisdev/supabase-modular-auth`, branch `main`;
- root-context Railpack build and the existing monorepo build command;
- backend watch paths for backend code, shared types, and root build inputs;
- the existing backend start command;
- `/health` with a 30-second healthcheck timeout;
- one replica in the current Railway region, the current resource limits, and
  the existing restart policy; and
- the current Serverless behavior.

The 26 existing application variables are declared with `preserve()` so IaC
can manage their presence without placing their values in Git.

Runtime variables and secrets remain in Railway's variable store until a
successful `railway config pull` against the production environment can verify
the complete variable graph. No secret values are committed. The frontend and
Redis provider remain outside this first IaC graph because adding them would
create new production resources rather than reconcile the environment that was
observed.

Pull requests touching `.railway/` run the official Railway config action. The
plan is commented on the pull request; a merge applies the exact reviewed plan.
The workflow uses the repository's `RAILWAY_TOKEN` secret, which must be a
project token scoped to the target production environment.

## Migration procedure

1. Upgrade the local Railway CLI to a release that supports TypeScript IaC.
2. Link the repository to the `supabase-modular-auth` production project and
   environment.
3. Run `railway config pull` into a temporary review branch if a full variable
   import is desired. Do not use `--include-variables`.
4. Reconcile the generated result with the checked-in staged definition,
   keeping secrets as `preserve()` or Railway-managed references.
5. Run `railway config plan` and require a zero-destruction, expected diff.
6. Merge the reviewed change and let the GitHub Action apply its pinned plan.
7. Verify `/health`, the startup Redis REST connection log, CSRF initialization,
   and login after an idle period.

Until the pull/plan has been reviewed successfully, the dashboard remains the
source of truth for any setting not represented in `.railway/railway.ts`.

## Alternatives considered

### Continue dashboard-only configuration

This avoids migration risk but leaves watch paths and build settings vulnerable
to drift and makes the deployment fix difficult to review.

### Add frontend and Redis resources immediately

This would match the repository's reference topology, but it would also change
the live architecture by moving or duplicating the Vercel frontend and
provisioning a new Redis service. That requires a separate rollout plan,
variable migration, and end-to-end validation.

### Keep legacy Config as Code

This is not selected because Railway has deprecated `railway.json` and
`railway.toml` in favor of project-level IaC, with a scheduled hard cutoff for
legacy files.

## Consequences

Positive:

- Deployment source, build inputs, watch paths, healthcheck, and restart policy
  become reviewable code.
- Pull requests receive a Railway diff before infrastructure changes are
  applied.
- The workflow protects against live-environment drift and stale reviewed
  plans.

Trade-offs:

- The initial definition intentionally does not claim a fully reproducible
  frontend/Redis topology.
- Dashboard-managed settings not yet proven in the IaC DSL still require
  operational documentation and review.
- Any future move to Railway-hosted frontend or TCP Redis needs a separate ADR
  or an update to this decision, including cookie, private-network, port, and
  availability validation.

## Revisit when

Revisit this ADR when the frontend moves to Railway, Redis changes transport or
provider, more replicas are required, or the project needs a fully private
backend origin. At that point, import the complete environment and expand the
single project definition in one reviewed change.
