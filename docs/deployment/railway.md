# Railway deployment

The repository's reference topology is two services from the same repository
and Railway project. Do not set `/frontend` or `/backend` as an isolated root
directory: this shared pnpm monorepo requires `types/`,
`pnpm-workspace.yaml`, and the root lockfile.

## Current production topology

The production Railway project currently contains the backend service only.
The frontend is hosted separately and Redis is an external Upstash REST store.
The backend runs from the repository root with Railpack, listens on Railway's
injected `PORT` (currently 8080), has one replica, and is allowed to sleep.
This is the topology captured by [ADR 0002](../decisions/0002-railway-infrastructure-as-code.md).

The checked-in IaC definition intentionally reconciles this existing backend
service first. It does not create a new frontend or Redis service. Those are
separate migrations because they would change the live network, cookie, and
variable topology.

## Railway Infrastructure as Code

[`.railway/railway.ts`](../../.railway/railway.ts) is the single project-level
definition for the settings currently being migrated. It owns the GitHub
source, root-context Railpack build, monorepo watch paths, start command,
`/health` check, replica count, sleep behavior, and restart policy. Runtime
variables and secrets remain in Railway until a complete production import has
been reviewed; never commit their values.

Use a current Railway CLI (IaC requires the newer CLI line), then link the
repository to the production project and environment:

```bash
railway login
railway link
railway config pull
railway config plan
railway config apply
```

Review the pull and plan before applying. Do not use
`railway config pull --include-variables`, because it decrypts and writes
variable values into the authoring file. The safe import represents existing
values with `preserve()`.

Pull requests that change `.railway/**` receive a plan from
`.github/workflows/railway-config.yml`. Merging the pull request applies the
reviewed plan. Configure the repository secret `RAILWAY_TOKEN` with a Railway
project token scoped to the target production environment before enabling the
workflow.

## Railway agent tooling

This repository includes the repository-local [`use-railway` skill](../../.agents/skills/use-railway/SKILL.md)
and the official hosted Railway MCP endpoint in [`.mcp.json`](../../.mcp.json).
The MCP configuration contains only the public endpoint; authentication is
performed locally by the developer's coding agent and is never committed.

For a new workstation, install or update the Railway CLI, then run:

```bash
railway setup agent --oauth
railway login
```

Restart the coding agent after setup so it discovers the skill and MCP server.
Use `railway setup agent --remote` when the editor should use Railway's CLI
proxy transport instead of direct OAuth to the hosted MCP server. Use the
Railway MCP server for authenticated service/deployment inspection and the
CLI for checkout-bound commands such as `railway config plan` and
`railway config apply`.

Never commit `RAILWAY_TOKEN` or any Railway variable value. CI should use a
project-scoped GitHub Actions secret; interactive agent sessions should use
OAuth.

## Watch paths for the shared monorepo

The backend patterns below are declared in IaC and should also be checked in
**Settings → Build → Watch Paths** until the first successful IaC plan/apply.
Keep the service root directory at `/`, then include every repository path that
can affect its root-level pnpm build.

For the backend service, use these patterns, one per line:

```text
/backend/**
/types/**
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
```

For the frontend service, use the equivalent patterns:

```text
/frontend/**
/types/**
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
```

The backend and frontend both import the shared `@supabase-modular-auth/types` package, so watching only `/backend/**` or `/frontend/**` can incorrectly skip deployments when shared validation or generated types change. Root package manifests and the lockfile are also build inputs. If Railway reports `No changes to watched files`, update the service's watch paths and use **Deploy Latest Commit** to deploy the skipped commit.

## Redis provider

Production needs one Redis database shared by every backend instance. The frontend never receives Redis credentials. Choose one of these supported topologies:

- **Railway private Redis:** Add Railway's Redis template and leave its public TCP proxy disabled. Reference the template's private `REDIS_URL` from the backend's `REDIS_TCP_CONNECTION_URL` variable.
- **External managed Redis (TCP):** Use `REDIS_TRANSPORT=tcp` (the default) and store the provider's `rediss://` connection string as `REDIS_TCP_CONNECTION_URL`.
- **Upstash REST (HTTPS):** Use `REDIS_TRANSPORT=rest` and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from Upstash's REST connection panel. Use the read/write token; rate limiting writes counters and loads scripts.

Select a provider region near Railway and use a distinct `REDIS_KEY_PREFIX` per environment. No application code is deployed to the Redis provider.

## Backend service

- Build command: `pnpm --filter @supabase-modular-auth/types build && pnpm --filter @supabase-modular-auth/backend build`
- Start command: `pnpm --filter @supabase-modular-auth/backend start`
- Healthcheck path: `/health`
- The current Railway deployment listens on the injected `PORT=8080`. Do not
  pin `PORT=3000` unless the Railway domain target and frontend proxy are
  changed together.
- The current backend has a generated public domain because the frontend is
  hosted separately. A private backend origin is the target for a future
  same-site frontend migration, not this staged IaC change.

Required values:

For the reference two-service deployment, use these values:

```env
NODE_ENV=production
PORT=3000
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
FRONTEND_URL=https://<frontend-public-domain>
BACKEND_URL=https://<frontend-public-domain>
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CSRF_COOKIE_SAME_SITE=strict
CSRF_COOKIE_SECURE=true
COOKIE_MAX_AGE_DAYS=7
TRUST_PROXY=1
# Railway private Redis:
REDIS_TRANSPORT=tcp
REDIS_TCP_CONNECTION_URL=${{Redis.REDIS_URL}}
# Or an external TLS Redis provider:
# REDIS_TCP_CONNECTION_URL=rediss://default:<password>@<host>:6379
REDIS_PING_INTERVAL_MS=30000
REDIS_KEY_PREFIX=supabase-saas:rate-limit:production:
```

Leave `COOKIE_DOMAIN` unset.
The checked-in Next.js rewrite path starts with one represented trusted hop at Express. Verify Railway's sanitized `X-Forwarded-For` chain and adjust only from observed headers; never use an unrestricted trust setting on a publicly reachable backend.

`REDIS_PING_INTERVAL_MS` sends a provider-neutral Redis `PING` every 30 seconds to reduce idle TCP socket eviction. It is not a retry or a bypass: connection failures still fail closed with `503` while node-redis reconnects. Set it to `0` only when the provider does not require it. Do not enable Railway Serverless mode for this backend while the periodic ping is enabled, because the outbound traffic keeps the service awake.

The current production deployment already uses Upstash REST. To use Upstash
REST in another environment, set these backend variables and redeploy:

```env
REDIS_TRANSPORT=rest
UPSTASH_REDIS_REST_URL=https://<your-database>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<read-write-rest-token>
REDIS_REST_TIMEOUT_MS=5000
```

Keep `REDIS_KEY_PREFIX` unchanged when switching transports to the same database so existing quotas remain in effect. REST mode ignores `REDIS_TCP_CONNECTION_URL` and TCP timeout/PING settings and creates no persistent Redis socket or periodic PING timer. It verifies Redis once at startup, then sends bounded HTTPS commands as requests arrive. Failures return `503`; subsequent requests can recover without restarting. There is no automatic fallback to TCP or memory and no automatic retry of a potentially applied counter write. REST removes idle Redis socket management but does not prevent provider outages or quotas. See [Upstash's REST API](https://upstash.com/docs/redis/features/restapi).

After deployment, look for `Rate limiting: shared Redis REST store connected` and verify `/auth/csrf-token` and login after an idle period. `/health` is a liveness check and does not establish Redis availability. To roll back the transport, set `REDIS_TRANSPORT=tcp` with a valid `REDIS_TCP_CONNECTION_URL` and redeploy.

## Frontend service

- Build command: `pnpm --filter @supabase-modular-auth/types build && pnpm --filter @supabase-modular-auth/frontend build`
- Start command: `pnpm --filter @supabase-modular-auth/frontend start`
- Enable a public Railway or custom domain.
- Healthcheck path: `/health` for an end-to-end proxy check.

Set the private backend origin before the build:

```env
FRONTEND_PROXY_TARGET=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:3000
NEXT_PUBLIC_API_BASE_URL=
```

The reference namespace must match the actual Railway service name. Browser clients cannot resolve `railway.internal`; only the Next.js server uses this value.

## Release check

After both services deploy, verify the backend logs a successful shared Redis-store connection, then verify registration, confirmation, login, session rotation, logout, reset/verification links, OAuth callback, admin denial for a normal user, and persistent audit logs.

Relevant Railway references: [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code), [monorepos](https://docs.railway.com/deployments/monorepo), [private domains](https://docs.railway.com/networking/domains/working-with-domains), [Redis](https://docs.railway.com/databases/redis), [variables](https://docs.railway.com/variables/reference), and [healthchecks](https://docs.railway.com/deployments/healthchecks).
