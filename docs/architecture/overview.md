# Architecture overview

The repository is a pnpm monorepo with three workspace packages and one canonical API contract.

```text
Browser
  -> Next.js App Router (public UI and same-origin proxy)
  -> Express API (validation, cookies, authentication, authorization)
  -> Supabase Auth/Admin APIs

Next.js + Express
  -> shared Zod schemas and API types
Express routes
  <-> OpenAPI contract and contract tests
```

## Trust boundaries

- The browser is untrusted. Client role flags and request payloads never authorize an action.
- Next.js is a presentation and proxy layer. It does not receive Supabase secrets or make privileged Supabase calls.
- Express is the application security boundary. It validates every protected session and enforces admin authorization.
- Supabase is the identity provider and managed data platform. The service-role key exists only in the backend environment.

## Package responsibilities

| Package     | Responsibility                                               |
| ----------- | ------------------------------------------------------------ |
| `frontend/` | Routes, forms, browser UX, first-party proxying              |
| `backend/`  | HTTP API, security policy, Supabase access, admin operations |
| `types/`    | Shared Zod schemas, response types, generated OpenAPI types  |
| `docs/api/` | Canonical HTTP operation and payload contract                |

## Intentional limits

- There is no product-specific schema or branding.
- User/admin roles exist, but substantive multi-tenant membership and tenant-owned product tables do not yet exist.
- Process-local rate limiting, lockout state, OAuth PKCE state, and audit fallback limit safe backend scaling to one replica until shared storage is added.

See [Backend](backend.md), [Frontend](frontend.md), and [Authentication](authentication.md) for component details.
