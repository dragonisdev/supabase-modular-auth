# Environment variables and secrets

The checked-in `.env.example` files are canonical. Never put real credentials in an example, Docker image, client bundle, log, test fixture, or pull request.

## Backend required values

| Variable                    | Sensitive     | Purpose                                                      |
| --------------------------- | ------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`              | No            | Supabase project origin                                      |
| `SUPABASE_ANON_KEY`         | Low privilege | Backend Auth client key; currently not needed in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Critical**  | Privileged admin operations; backend only                    |
| `FRONTEND_URL`              | No            | Exact allowed browser origin for CORS and redirects          |

`BACKEND_URL` is optional in validation but required for OAuth. In same-origin proxy mode it must be the public frontend origin, because that is where the callback and host-only cookies belong.

Use exact origins with no trailing slash for `FRONTEND_URL` and `BACKEND_URL`, for example `https://app.example.com`. CORS compares origins exactly, and callback paths are appended to these values.

## Backend optional values

| Group          | Variables                                                                                  | Defaults/notes                                                                |
| -------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Server         | `PORT`, `NODE_ENV`, `BACKEND_URL`                                                          | `3000`, `development`; production must use literal `production`               |
| Cookies        | `COOKIE_NAME`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_MAX_AGE_DAYS` | Refresh lifetime defaults to 7 days; leave domain unset for `__Host-` cookies |
| CSRF cookie    | `CSRF_COOKIE_SAME_SITE`, `CSRF_COOKIE_SECURE`                                              | `strict`; secure flag inherits auth-cookie setting                            |
| General limits | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `STRICT_RATE_LIMIT_MAX_REQUESTS`        | See `backend/.env.example`                                                    |
| Redis          | `REDIS_URL`, `REDIS_KEY_PREFIX`, `REDIS_CONNECT_TIMEOUT_MS`, `REDIS_PING_INTERVAL_MS`      | URL is required in production; prefix should be unique per environment        |
| Auth limits    | `AUTH_RATE_LIMIT_MAX_REQUESTS`, `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_DURATION_MS`              | Rate limits use Redis; account lockout remains process-local                  |
| HTTP security  | `TRUST_PROXY`, `REQUEST_TIMEOUT_MS`, `MAX_REQUEST_SIZE`                                    | Proxy hops must match the real topology                                       |

Production startup rejects insecure auth cookies. Recommended same-origin values are:

```env
NODE_ENV=production
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
CSRF_COOKIE_SAME_SITE=strict
CSRF_COOKIE_SECURE=true
COOKIE_MAX_AGE_DAYS=7
```

Set `TRUST_PROXY` from the forwarding entries Express actually receives, not from the number of physical proxies. The checked-in Next.js rewrite path starts at one represented trusted hop because Next.js is the immediate peer and preserves the sanitized client forwarding value. Verify this in each environment because client IP identity drives rate limiting, lockout, and audit context.

`REDIS_URL` accepts `redis://` and `rediss://`. Use `rediss://` for external providers; use unencrypted `redis://` only within an isolated private network such as the production Compose network. The URL may contain a username and password and is therefore a secret. All backend instances in one environment must use the same `REDIS_KEY_PREFIX`; environments sharing one Redis service must use different prefixes. `REDIS_CONNECT_TIMEOUT_MS` applies to each socket attempt. `REDIS_PING_INTERVAL_MS` sends a Redis `PING` on a live TCP connection every 30 seconds by default; set it to `0` to disable it. Before the first successful connection, startup allows at most four attempts (the initial attempt plus three retries) and exits non-zero instead of waiting forever. After Redis has been ready once, the client keeps retrying with exponential backoff capped at three seconds; requests fail closed with a normalized `503` while it reconnects. When no URL is present in development or tests, the limiter deliberately uses process memory and is not suitable for multiple backend processes.

The periodic ping is a portable mitigation for idle TCP connection eviction, not an availability guarantee. It creates outbound traffic, so do not enable Railway Serverless mode for this backend unless you deliberately accept that it will prevent the service from sleeping.

## Rate-limit behavior

| Scope            | Applies to                                                    | Key                        | Limit source                                       |
| ---------------- | ------------------------------------------------------------- | -------------------------- | -------------------------------------------------- |
| Global           | Every route except `/health`                                  | Client IP                  | `RATE_LIMIT_*`; production uses `STRICT_*`         |
| Authentication   | Registration, login, and Google authorization URL             | Client IP                  | `AUTH_RATE_LIMIT_MAX_REQUESTS`                     |
| Sensitive auth   | Password-reset request and password reset                     | Client IP                  | Half the auth limit, minimum 3                     |
| Admin read/write | Authenticated admin routes, separated by HTTP read/write mode | Authenticated user ID + IP | Derived from the general and authentication limits |

An authentication or admin request can consume both the global quota and its route-specific quota. Exceeding a quota returns the route's normalized `429` response. In production all of these counters share Redis; if Redis is unavailable, the request returns `503` rather than bypassing a security control.

## Frontend values

| Variable                   | Exposure                  | Purpose                                                          |
| -------------------------- | ------------------------- | ---------------------------------------------------------------- |
| `FRONTEND_PROXY_TARGET`    | Next.js server/build only | Private Express origin used by rewrites                          |
| `NEXT_PUBLIC_API_BASE_URL` | Browser-visible           | Optional direct cross-origin fallback; leave empty in proxy mode |
| `PORT`                     | Runtime                   | Production Next.js listen port                                   |

Anything prefixed `NEXT_PUBLIC_` can be embedded in browser JavaScript and must never contain a secret.

## Test-only values

- `TEST_DATABASE_URL` must point to a disposable PostgreSQL database.
- `TEST_REDIS_URL` enables the cross-instance Redis rate-limit integration test; default CI supplies a disposable Redis service.
- `RUN_LIVE_SUPABASE_TESTS=true` opts into live auth mutation.
- `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, and `SUPABASE_TEST_SERVICE_ROLE_KEY` must belong to a dedicated test project.
- Remote live tests additionally require `ALLOW_REMOTE_SUPABASE_TESTS=true`.

## Secret handling

- Local: use ignored `backend/.env` and `frontend/.env.local` files with restricted filesystem access.
- Railway/cloud: use the platform secret store and separate values per environment.
- Docker: Compose reads `backend/.env` at runtime; `.dockerignore` prevents it from entering the build context.
- CI: use repository/environment secrets only for explicit opt-in live jobs. Default CI requires no Supabase credentials.
- Rotation: if the service-role key is exposed, rotate it in Supabase immediately, update every environment, redeploy, and review admin/audit activity.

Google provider secrets and SMTP credentials are configured in Supabase, not in the frontend or this repository.
