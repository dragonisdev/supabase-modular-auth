# Railway deployment

Deploy two services from the same repository and Railway project. Do not set `/frontend` or `/backend` as an isolated root directory: this shared pnpm monorepo requires `types/`, `pnpm-workspace.yaml`, and the root lockfile.

Add a private Redis database service from Railway's Redis template. Do not enable its public TCP proxy. The backend references the template's private `REDIS_URL`; the frontend does not receive Redis variables.

## Backend service

- Build command: `pnpm --filter @supabase-modular-auth/types build && pnpm --filter @supabase-modular-auth/backend build`
- Start command: `pnpm --filter @supabase-modular-auth/backend start`
- `PORT=3000`
- Healthcheck path: `/health`
- Keep the service private; a public backend domain is not required.

Required values:

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
REDIS_URL=${{Redis.REDIS_URL}}
```

Leave `COOKIE_DOMAIN` unset.
The checked-in Next.js rewrite path starts with one represented trusted hop at Express. Verify Railway's sanitized `X-Forwarded-For` chain and adjust only from observed headers; never use an unrestricted trust setting on a publicly reachable backend.

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

The reference namespace must match the actual backend service name. Browser clients cannot resolve `railway.internal`; only the Next.js server uses this value.

## Release check

After both services deploy, verify registration, confirmation, login, session rotation, logout, reset/verification links, OAuth callback, admin denial for a normal user, and persistent audit logs.

Relevant Railway references: [monorepos](https://docs.railway.com/deployments/monorepo), [private domains](https://docs.railway.com/networking/domains/working-with-domains), [Redis](https://docs.railway.com/databases/redis), [variables](https://docs.railway.com/variables/reference), and [healthchecks](https://docs.railway.com/deployments/healthchecks).
