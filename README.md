# Supabase Auth Starter (Backend API + Next.js frontend)

A modular Supabase authentication system: stateless backend API plus a minimal Next.js App Router frontend. Point the backend to your own Supabase project via environment variables, and you get a drop-in auth service (email/password, verification, reset, OAuth) backed by HttpOnly cookies. The frontend is intentionally thin—it only talks to the backend and never touches Supabase directly.

For deployment help, see [deployment.md](deployment.md).  
For frontend details, see [frontend/frontend.md](frontend/frontend.md).  
For backend details, see [backend/backend.md](backend/backend.md).

---

## What's inside

- Backend: Node.js + TypeScript + Express + Supabase Auth. Stateless JWT, HttpOnly cookies, Zod validation, Helmet, CORS, rate limiting.
- Frontend: Next.js 16 (App Router) + TypeScript + Tailwind. Uses fetch with `credentials: 'include'`; no Supabase client.
- Monorepo layout: backend API in `backend/`, frontend in `frontend/`, shared guidance in repo root.

## Features

- Email/password registration with email verification
- Login for verified users only
- Forgot/reset password flow
- Google OAuth URL + callback (backend handles exchange and cookies)
- HttpOnly cookie-based auth; frontend never sees tokens
- Rate limiting, security headers, CORS, non-enumerating errors
- Type-safe validation and responses
- Admin module (server-enforced): user listing/search, create/update/delete, ban/unban, bulk actions, and audit log feed

## Architecture & flow

1. Frontend calls backend API with `credentials: 'include'`.
2. Backend validates inputs with Zod, talks to Supabase, and issues HttpOnly cookies.
3. Protected data fetched via `/auth/me`; 401 responses drive redirects to login.
4. OAuth handled entirely server-side; frontend just redirects to the provided URL.

## Getting started

1. Clone the repo:

```bash
git clone https://github.com/dragonisdev/supabase-modular-auth.git
cd supabase-modular-auth
```

2. Install dependencies:

```bash
pnpm i --frozen-lockfile
```

3. Configure environment variables for both backend and frontend (see below).
4. Start the development servers:

```bash
pnpm --filter types build
pnpm dev
```

## Environment configuration

Tune these to point the backend at your Supabase project. See [backend/backend.md](backend/backend.md) for details.

**Backend (required)**

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL` (for CORS + redirects)
- `PORT` (optional, default 3000)
- `NODE_ENV` (optional, default development)
- `BACKEND_URL` (optional)
- Cookie flags: `COOKIE_NAME`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_MAX_AGE_DAYS` (optional)
- CSRF cookie flags: `CSRF_COOKIE_SAME_SITE`, `CSRF_COOKIE_SECURE` (optional)
- Rate limiting: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS` (optional)
- Security: `TRUST_PROXY`, `REQUEST_TIMEOUT_MS`, `MAX_REQUEST_SIZE` (optional)
- Lockout: `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_DURATION_MS` (optional)

**Frontend**

- `NEXT_PUBLIC_API_BASE_URL` to point fetch calls at the backend.
- Optional: `FRONTEND_PROXY_TARGET` for same-origin proxying (recommended for Safari). When using this, leave `NEXT_PUBLIC_API_BASE_URL` empty so the client uses relative `/auth/*` paths.

**Google OAuth setup**

- Enable the Google provider in Supabase Auth settings.
- In Google Cloud OAuth client, set redirect URI to: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
- In Supabase Auth URL configuration, allow: `${BACKEND_URL}/auth/google/callback`.
- In production, set `BACKEND_URL` in the backend env.

## Create the first admin

This step is very important as without it, no one will be able to access the admin panel. Note that this is a one-time step, as you can add more admins from the admin panel itself.

1. Make sure the project is running (locally or deployed)
2. Use the registration page to create a new user
3. Go to the Supabase dashboard → SQL Editor
4. Run this to grab the user ID of the newly created user (replace the email):
   ```sql
   select id, email, raw_app_meta_data
   from auth.users
   where email = 'you@example.com';
   ```
5. Copy the `id` and run this to promote the user to admin (replace the user ID):
   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
     || jsonb_build_object('role', 'admin', 'is_admin', true)
   where id = 'USER_UUID_HERE';
   ```
6. While we're at it, let's get the admin logs working
7. Go in your Supabase dashboard → Integrations → Cron and enable `pg_cron`
8. Copy-paste the content of [`backend/supabase/migrations/20260311_admin_audit_logs.sql`](backend/supabase/migrations/20260311_admin_audit_logs.sql) into the SQL editor and run it to create the `admin_audit_logs` table. This is required for the admin audit feed to work.

## Deployment guide

Below are practical deployment recipes for common setups. Choose one and keep **frontend and backend origins** aligned with the notes to avoid Safari cookie issues.

**Monorepo build note:** both frontend and backend import `@supabase-modular-auth/types`. In CI/CD, build from the repo root (or build `types` first) so the package is available during build.

### Recipe A — Frontend on Vercel + Backend on Railway

**Frontend (Vercel)**

- Deploy `frontend/` as a Next.js app.
- Vercel project settings (monorepo-safe):
  - **Framework Preset**: `Next.js`
  - **Root Directory**: `frontend`
  - **Install Command**: `cd .. && pnpm i --frozen-lockfile`
  - **Build Command**: `cd .. && pnpm --filter @supabase-modular-auth/types build && pnpm --filter @supabase-modular-auth/frontend build`
  - **Output Directory**: leave empty (Next.js handles this automatically)
- Set env:
  - **Recommended**: `FRONTEND_PROXY_TARGET=https://<your-backend-domain>` and leave `NEXT_PUBLIC_API_BASE_URL` empty (same-origin proxy mode).
  - Alternative: `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-domain>` (cross-site cookies may fail due browser restrictions).

**Backend (Railway)**

- Deploy `backend/` as a Node.js service.
- Set env:
  - `FRONTEND_URL=https://<your-frontend-domain>`
  - `BACKEND_URL=https://<your-backend-domain>` (required for OAuth callbacks)
  - `NODE_ENV=production`
  - `COOKIE_SECURE=true`
  - `COOKIE_SAME_SITE=lax` (same-site) or `none` (cross-site)
  - `CSRF_COOKIE_SAME_SITE=strict` (same-site) or `none` (cross-site)
  - `CSRF_COOKIE_SECURE=true` (inherits from `COOKIE_SECURE` if unset)

**Safari tip:** If you keep frontend and backend on different **sites** (different eTLD+1), Safari may block cookies. Prefer same-origin proxying via `FRONTEND_PROXY_TARGET`.

**CSRF/cookie troubleshooting:** if login fails with `CSRF token missing`, your browser is likely blocking cross-site cookies. Switch to same-origin proxy mode on Vercel (`FRONTEND_PROXY_TARGET` set, `NEXT_PUBLIC_API_BASE_URL` empty), then redeploy frontend.

### Recipe B — Frontend on Netlify + Backend on Railway

Same as Recipe A. Netlify deploys `frontend/` and Railway deploys `backend/`.

- Netlify env:
  - `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-domain>`
  - (Optional) `FRONTEND_PROXY_TARGET=https://<your-backend-domain>` and leave `NEXT_PUBLIC_API_BASE_URL` empty

- Railway env:
  - `FRONTEND_URL=https://<your-frontend-domain>`
  - `BACKEND_URL=https://<your-backend-domain>`
  - `NODE_ENV=production`
  - `COOKIE_SECURE=true`
  - `COOKIE_SAME_SITE=lax` (same-site) or `none` (cross-site)
  - `CSRF_COOKIE_SAME_SITE=strict` (same-site) or `none` (cross-site)

### Recipe C — Single VPS (same-site deployment)

**Goal:** Keep both apps on the same site (recommended) and proxy the backend through the frontend domain to keep cookies first-party.

**Suggested layout**

- `https://app.example.com` → Next.js frontend
- `https://app.example.com/auth/*` → proxied to backend

**Frontend**

- Set `FRONTEND_PROXY_TARGET=https://app.example.com` (or your backend origin)
- Leave `NEXT_PUBLIC_API_BASE_URL` empty to use relative `/auth/*` paths

**Backend**

- Set `FRONTEND_URL=https://app.example.com`
- Set `BACKEND_URL=https://app.example.com`
- `COOKIE_SECURE=true`
- `COOKIE_SAME_SITE=lax`
- `CSRF_COOKIE_SAME_SITE=strict`

**Reverse proxy notes**

- Ensure your proxy forwards cookies and headers.
- If you serve backend on a separate internal port, proxy `/auth/*` and `/health` to it.

## API surface (high level)

- `POST /auth/register` — register, returns "check your email to verify"
- `POST /auth/login` — login, sets HttpOnly cookie
- `POST /auth/logout` — clear session cookie
- `POST /auth/forgot-password` — always returns success to avoid enumeration
- `POST /auth/reset-password` — uses token from Supabase email (in cookie)
- `GET /auth/google/url` — obtain OAuth redirect URL
- `GET /auth/me` — current user info; 401 if not authenticated
- `GET /admin/users` — list users (admin only)
- `GET /admin/users/:id` — get user details (admin only)
- `POST /admin/users/create` — create user (admin only)
- `POST /admin/users/:id/update` — update user (admin only)
- `POST /admin/users/:id/delete` — hard delete user (admin only)
- `POST /admin/users/:id/ban` — ban user with optional reason/expiry (admin only)
- `POST /admin/users/:id/unban` — unban user (admin only)
- `POST /admin/users/bulk` — bulk moderation/delete actions (admin only)
- `GET /admin/audit-logs` — list admin audit events (admin only)

Full request/response shapes are in [backend/backend.md](backend/backend.md).

## Frontend behaviors

- Uses fetch with `credentials: 'include'` for all auth-related calls.
- Pages: register, login, forgot-password, reset-password, dashboard (protected), logout.
- Redirect to `/login` on `401` from protected calls.
- Generic error messages; special-case unverified email on login.

See [frontend/frontend.md](frontend/frontend.md) for flow details.

## Security posture

- HttpOnly cookies; no tokens in localStorage/sessionStorage.
- Helmet security headers, CORS restricted via `FRONTEND_URL`, same-site cookies.
- Non-enumerating auth errors and rate limiting on auth endpoints.
- **Safari note:** third-party cookies may be blocked. Prefer same-origin proxying via `FRONTEND_PROXY_TARGET`.

## Project structure

- `backend/` — Express API, routes, controllers, middleware, services, validators.
- `frontend/` — Next.js App Router pages and minimal UI flows.
- `tsconfig.json` — root TypeScript config references.

## Customization

- Swap or add providers: extend Supabase auth calls in backend services.
- Adjust cookie settings for your domain and HTTPS needs.
- Extend rate limits or error handling to match your policies.
- Theme or re-skin the frontend without changing its fetch patterns.

## License

ISC
