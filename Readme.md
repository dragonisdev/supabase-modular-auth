# Supabase Auth Starter (Backend API + Next.js Frontend)

A modular Supabase authentication system: stateless backend API plus a minimal Next.js App Router frontend. Point the backend to your own Supabase project via environment variables, and you get a drop-in auth service (email/password, verification, reset, OAuth) backed by HttpOnly cookies. The frontend is intentionally thin—it only talks to the backend and never touches Supabase directly.

---

## What’s Inside
- Backend: Node.js + TypeScript + Express + Supabase Auth. Stateless JWT, HttpOnly cookies, Zod validation, Helmet, CORS, rate limiting.
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind. Uses fetch with `credentials: 'include'`; no Supabase client.
- Monorepo layout: backend API in `backend/`, frontend in `frontend/`, shared guidance in repo root.

## Features
- Email/password registration with email verification
- Login for verified users only
- Forgot/reset password flow
- Google OAuth URL + callback (backend handles exchange and cookies)
- HttpOnly cookie-based auth; frontend never sees tokens
- Rate limiting, security headers, CORS, non-enumerating errors
- Type-safe validation and responses

## Architecture & Flow
1) Frontend calls backend API with `credentials: 'include'`.
2) Backend validates inputs with Zod, talks to Supabase, and issues HttpOnly cookies.
3) Protected data fetched via `/auth/me`; 401 responses drive redirects to login.
4) OAuth handled entirely server-side; frontend just redirects to the provided URL.

## Getting Started
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
pnpm dev
```

## Environment Configuration
Tune these to point the backend at your Supabase project. See [backend/backend.md](backend/backend.md) for details.

**Backend (required)**
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL` (for CORS + redirects)
- `PORT` (optional, default 3000)
- Cookie flags: `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE` (optional)

**Frontend**
- `NEXT_PUBLIC_API_BASE_URL` to point fetch calls at the backend.

## API Surface (high level)
- `POST /auth/register` — register, returns “check your email to verify”
- `POST /auth/login` — login, sets HttpOnly cookie
- `POST /auth/logout` — clear session cookie
- `POST /auth/forgot-password` — always returns success to avoid enumeration
- `POST /auth/reset-password` — uses token from Supabase email (in cookie)
- `GET /auth/google/url` — obtain OAuth redirect URL
- `GET /auth/me` — current user info; 401 if not authenticated

Full request/response shapes are in [backend/backend.md](backend/backend.md).

## Frontend Behaviors
- Uses fetch with `credentials: 'include'` for all auth-related calls.
- Pages: register, login, forgot-password, reset-password, dashboard (protected), logout.
- Redirect to `/login` on `401` from protected calls.
- Generic error messages; special-case unverified email on login.
See [frontend/frontend.md](frontend/frontend.md) for flow details.

## Security Posture
- HttpOnly cookies; no tokens in localStorage/sessionStorage.
- Helmet security headers, CORS restricted via `FRONTEND_URL`, same-site cookies.
- Non-enumerating auth errors and rate limiting on auth endpoints.

## Project Structure
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
