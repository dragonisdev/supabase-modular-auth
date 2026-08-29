# Setup

This guide keeps one topology across local development, Railway, and a single VM:

```text
Browser -> public HTTPS Next.js -> same-origin proxy -> private Express API -> Supabase
```

Only Next.js needs to be public. Express remains the security boundary and should not be exposed unless the hosting platform requires it.

## Prerequisites

- Node.js 24, or Node.js 22.18+
- pnpm 10.32.1
- A dedicated Supabase project
- Docker Engine with the Compose plugin for the container workflow
- A public domain and HTTPS before production

## 1. Prepare Supabase

1. Create a Supabase project and record its project URL, publishable/anon key, and service-role key.
2. Keep email confirmation enabled.
3. Set the Auth Site URL to the exact frontend origin, such as `https://app.example.com`.
4. Allow only the frontend callback routes you use:
   - `https://app.example.com/auth/google/callback`
   - `https://app.example.com/auth/verify`
   - `https://app.example.com/reset-password`
5. Configure custom SMTP before production. Supabase's default mail service is intended for evaluation, not production delivery.
6. Follow [Link and initialize a hosted Supabase project](database/migrations.md#link-and-initialize-a-hosted-supabase-project) to inspect and apply the repository migrations before deploying application code that depends on them.

If Google OAuth is enabled, configure the provider in Supabase and use Supabase's provider callback URL in Google Cloud. The application callback remains the frontend-origin `/auth/google/callback` route.

See Supabase's current guidance for [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [production readiness](https://supabase.com/docs/guides/deployment/going-into-prod), and [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Configure the application

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Fill in the three Supabase values in `backend/.env`. For local proxy mode, keep:

```env
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3001
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
CSRF_COOKIE_SAME_SITE=strict
```

In `frontend/.env.local`, use:

```env
NEXT_PUBLIC_API_BASE_URL=
FRONTEND_PROXY_TARGET=http://localhost:3000
```

The full configuration and sensitivity matrix is in [Environment variables and secrets](configuration/environment.md).

## 3. Run on the host

```bash
pnpm install --frozen-lockfile
pnpm --filter @supabase-modular-auth/types build
pnpm dev
```

Open `http://localhost:3001` and verify `http://localhost:3001/health` returns success through the Next.js proxy.

## Docker Compose development

The Compose stack runs the frontend on port 3001 and the backend on port 3000. It reads ignored secrets from `backend/.env`; it does not include Supabase itself.

```bash
pnpm compose:check
pnpm compose:dev
```

For source synchronization and automatic image rebuilds with a recent Compose plugin:

```bash
pnpm compose:watch
```

Changes under `backend/src`, `frontend/app`, `frontend/components`, and `frontend/lib` are synchronized. Rebuild after changing dependencies, shared types, or container configuration.

The application Compose stack does not include Supabase. For a local database-only Supabase environment, use the pinned CLI workflow in [Database migrations](database/migrations.md). A plain PostgreSQL container is not a substitute for Supabase Auth, PostgREST, and its supporting services.

## Railway deployment

The preferred Railway shape is two services in one project: a public `frontend` and private `backend`. Keep the repository root available to both services because both depend on the root lockfile and `types/` package.

Follow [Railway deployment](deployment/railway.md) for exact commands and variables. Important constraints:

- Set `NODE_ENV=production`, not the Railway environment name.
- Set the backend to a fixed internal `PORT=3000` and healthcheck `/health`.
- Set `FRONTEND_PROXY_TARGET` before the frontend build; rewrites are compiled during `next build`.
- Leave `NEXT_PUBLIC_API_BASE_URL` unset.
- Keep one backend replica until shared rate limiting and lockout storage are implemented.

Railway documents [shared monorepo deployment](https://docs.railway.com/deployments/monorepo), [private networking](https://docs.railway.com/networking/private-networking), and [deployment healthchecks](https://docs.railway.com/deployments/healthchecks).

## Single-VM deployment

The checked-in `compose.production.yaml` is the provider-neutral baseline. It exposes Next.js only on VM loopback (`127.0.0.1:3001`) and keeps Express on the Compose network.

1. Provision a current Linux VM. Use at least 4 GB RAM when building both images on the VM; a smaller measured runtime can use prebuilt images instead.
2. Restrict SSH to administrator IPs and allow public TCP 80/443 only.
3. Install Docker Engine and the Compose plugin from Docker's official repository.
4. Clone the repository and create `backend/.env` from the example.
5. Set production values:

   ```env
   NODE_ENV=production
   FRONTEND_URL=https://app.example.com
   BACKEND_URL=https://app.example.com
   COOKIE_SECURE=true
   COOKIE_SAME_SITE=lax
   CSRF_COOKIE_SAME_SITE=strict
   CSRF_COOKIE_SECURE=true
   COOKIE_MAX_AGE_DAYS=7
   # The checked-in Next.js rewrite path expects one represented trusted hop.
   TRUST_PROXY=1
   ```

6. Start the private application stack:

   ```bash
   pnpm compose:check
   pnpm compose:prod
   ```

7. Terminate TLS with Caddy, Nginx, or the provider load balancer and proxy the public domain to `127.0.0.1:3001`. A minimal Caddy site is:

   ```caddyfile
   app.example.com {
     reverse_proxy 127.0.0.1:3001
   }
   ```

8. Configure DNS, obtain a trusted certificate, and verify that client IPs used by rate limits and audit logs match the sanitized forwarding chain. Do not infer `TRUST_PROXY` from the number of physical proxies; validate the headers Express actually receives.

Docker describes Compose on a [single production server](https://docs.docker.com/compose/how-tos/production/). The platform mapping is deliberately small:

| Target       | VM/network equivalent                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| AWS          | EC2 instance, Security Group allowing restricted SSH plus 80/443, optional load balancer |
| DigitalOcean | Droplet, Cloud Firewall allowing restricted SSH plus 80/443, optional load balancer      |
| Other VM     | Linux host, equivalent firewall, DNS, TLS termination, backups, and monitoring           |

AWS documents [EC2 Security Groups](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/creating-security-group.html); DigitalOcean documents its [production-ready Droplet baseline](https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/).

For two VMs, place both on a private network, build the frontend with the backend's private origin, and allow the backend port only from the frontend VM. Do not copy the single-host Compose DNS name (`backend`) across hosts.

## Admin bootstrap

See [Admin access](operations/admin-access.md) for the short operational reference and reusable SQL examples. For the transaction-safe operator query, use [`database/queries/admin/promote_user_to_admin.sql`](../database/queries/admin/promote_user_to_admin.sql): replace its `null::uuid` sentinel in a temporary copy, then run it once in the Supabase SQL editor. The query fails unless exactly one user changes.

Never commit a real user UUID, and never auto-promote users through seed data.

The audit-log migration must be present before treating the admin audit feed as durable. Without it, the current service can fall back to process memory.

## Verification checklist

- `GET /health` works through the public frontend origin.
- Registration requires email confirmation.
- Login sets access and refresh cookies as HttpOnly.
- An expired access session rotates without exposing tokens to the browser.
- Logout clears both cookies.
- Password reset and verification links return to the frontend origin.
- OAuth returns to `/auth/google/callback` on the frontend origin.
- A normal user receives 401 from admin endpoints.
- The first admin can read the persistent audit feed.
- Only frontend ports are public; the service-role key exists only in the backend environment.

## Scaling boundary

Run one backend replica for now. Rate-limit counters, account lockout state, OAuth PKCE state, and the audit fallback include process-local storage. Redis-backed coordination and durable reconciliation belong in separate changes before horizontal scaling.
