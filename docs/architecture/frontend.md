# Frontend architecture

`frontend/` is a deliberately thin Next.js App Router application. It renders auth/admin screens, sends requests through the Express API, and never initializes a Supabase client.

## Proxy model

Recommended production and local browser requests are same-origin:

| Browser path        | Express destination |
| ------------------- | ------------------- |
| `/auth/:path*`      | `/auth/:path*`      |
| `/api/admin/:path*` | `/admin/:path*`     |
| `/health`           | `/health`           |

`FRONTEND_PROXY_TARGET` is read by Next.js while building rewrites. Leave `NEXT_PUBLIC_API_BASE_URL` empty in this mode. The `/api/admin/*` namespace avoids colliding with App Router pages under `/admin/*`.

## Client rules

- Always use `credentials: "include"`.
- Never store or decode auth tokens in browser storage.
- Read authentication state from `/auth/me`.
- Redirect to `/login` on a terminal 401, not on a transient backend 5xx/network failure.
- Send `X-CSRF-Token` on state-changing requests after initializing `/auth/csrf-token`.
- Treat client-side admin navigation as UX only; Express performs authorization.

## Routes

- Public: `/`, `/register`, `/login`, `/forgot-password`, `/reset-password`, verification/error callbacks.
- Protected: `/dashboard`, `/logout`.
- Admin UI: `/admin`, `/admin/users`, `/admin/audit`.

Password recovery uses a request-scoped implicit-flow client so the email returns an access token in the URL fragment without relying on process-local PKCE verifier state. The reset page parses the fragment and sends the required access token to Express without persisting it. The verification page only interprets the callback result and redirects the user to login; it does not exchange the fragment with Express.

## Deployment behavior

`pnpm --filter @supabase-modular-auth/frontend dev` uses port 3001. Production `next start` honors the platform's `PORT` variable. Keep frontend and backend on the same site through proxying to reduce Safari/ITP cookie failures.
