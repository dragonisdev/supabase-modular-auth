# Backend architecture

`backend/` is a JSON-only Express API. The normal request chain is:

```text
middleware -> route -> controller -> service -> Supabase
```

## Layers

- `config/` validates environment variables before startup.
- `middleware/` applies request IDs, security headers, CORS, body limits, CSRF, authentication, authorization, and normalized errors.
- `routes/` defines the public, protected, and admin HTTP surface.
- `controllers/` coordinates validation and response behavior.
- `services/` owns Supabase clients, session refresh, lockout state, and audit persistence.
- `validators/` adds server-only validation such as stronger password scoring.
- `utils/` centralizes cookies, logging, errors, and response envelopes.

## Security invariants

- Access and refresh tokens are stored in separate HttpOnly cookies.
- Every protected request validates the user with Supabase; JWT payloads are not trusted without that call.
- Expired access sessions may rotate through the refresh cookie. Retryable Supabase failures preserve cookies, while terminal authentication failures clear them.
- Every non-safe HTTP method requires the double-submit CSRF cookie/header pair, except the explicit OAuth callback.
- Admin access is derived from server-verified Supabase `app_metadata`.
- Passwords, tokens, cookies, authorization headers, and service keys must never be logged.
- CORS currently permits only `GET`, `POST`, and `OPTIONS`; add verbs deliberately if routes change.
- Production rate-limit counters live in Redis. Startup fails when Redis is absent or unreachable, and requests fail closed with a normalized service-unavailable response during an outage.
- Billing endpoints create Stripe-hosted Checkout and Customer Portal sessions; webhook signatures are verified before billing projections are updated.

## Lifecycle

Before listening for HTTP traffic, the backend verifies the Redis rate-limit store. The initial connection has a bounded number of retries, so a bad endpoint cannot leave deployment startup pending indefinitely. On `SIGTERM` or `SIGINT`, it gives active HTTP requests up to eight seconds to finish before closing their connections; the operating system closes the Redis socket when the process exits. HTTP lifecycle failures are recorded through the sanitized logger and produce a non-zero exit status. `/health` remains a lightweight, rate-limit-exempt process liveness check; monitor Redis separately for runtime availability.

## State and scaling

Rate-limit counters are shared through Redis and therefore remain consistent across backend instances. Account lockout, OAuth PKCE state, and the audit fallback can still be process-local, so keep one backend replica until those remaining boundaries move to shared or durable storage. See the [Redis rate-limiting decision](../decisions/0001-redis-rate-limiting.md).

## API and data

The endpoint contract is [OpenAPI](../api.md), not a duplicated Markdown endpoint list. Database behavior is described in [Contracts and data boundaries](contracts-and-data.md) and [Database migrations](../database/migrations.md). Billing configuration and deferred product decisions are documented in [Stripe billing](../billing/stripe.md).
