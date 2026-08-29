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

## State and scaling

The HTTP API is mostly stateless, but the current lockout implementation, rate-limit counters, OAuth PKCE state, and audit fallback can be process-local. Keep one backend replica until these are moved to shared/durable storage.

## API and data

The endpoint contract is [OpenAPI](../api.md), not a duplicated Markdown endpoint list. Database behavior is described in [Contracts and data boundaries](contracts-and-data.md) and [Database migrations](../database/migrations.md).
