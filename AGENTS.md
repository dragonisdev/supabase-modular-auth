## AGENTS.md — AI guide for `supabase-modular-auth`

This repo is a **monorepo** for a Supabase-auth-backed system with:

- **Backend**: Stateless Express API (TypeScript) in `backend/`
- **Frontend**: Minimal Next.js 16 App Router demo in `frontend/`
- **Shared types**: Zod schemas + API types in `types/`

The frontend is intentionally thin: it **never calls Supabase** directly. All auth flows go through the backend API, which owns JWT validation, cookies, and security policy.

---

## High-level architecture & flow

1. **Frontend** makes `fetch` calls to backend with `credentials: "include"`.
2. **Backend** validates input (Zod), calls Supabase Auth, and issues **HttpOnly cookies**.
3. **Protected calls** use `/auth/me` to verify the session on every request.
4. **OAuth** is fully server-side; frontend only redirects to the URL provided by the backend.

Key backend chain: **Middleware → Routes → Controllers → Services → Supabase**.

---

## Repository map

```
/
├─ backend/            # Express API (auth + security)
│  ├─ src/
│  │  ├─ app.ts        # Express app & middleware order
│  │  ├─ index.ts      # Entry point
│  │  ├─ config/       # env validation
│  │  ├─ controllers/  # auth logic
│  │  ├─ middleware/   # auth, csrf, error, request-id
│  │  ├─ routes/       # API routes
│  │  ├─ services/     # Supabase + lockout
│  │  ├─ utils/        # errors, response, logger
│  │  └─ validators/   # input validation (zod + zxcvbn)
├─ frontend/           # Next.js App Router demo
│  ├─ app/             # routes & pages
│  ├─ components/      # form inputs, csrf provider
│  └─ lib/             # API client
└─ types/              # Shared schemas + types (Zod)
```

---

## Backend rules (security-first)

- **No UI logic** in backend; return JSON only.
- **Supabase auth only** (no custom auth tables).
- **Never log** passwords, tokens, or secrets (logger sanitizes sensitive fields).
- **Normalize errors** to avoid user enumeration.
- **Email verification is required** before login (`email_confirmed_at`).
- **JWTs are validated on every protected route** with `supabase.auth.getUser`.
- **CSRF protection** is mandatory for non-GET requests.
- **Rate-limiting** and **lockout** must stay in place for auth endpoints.

### CSRF rules

- **Cookie**: `csrf_token` (non-HttpOnly, SameSite=Strict)
- **Header**: `X-CSRF-Token`
- **Protected**: all non-GET/HEAD/OPTIONS routes
- **Excluded**: `/auth/google/callback`, `/health`
- Frontend initializes CSRF via `GET /auth/csrf-token` (see `CsrfProvider`).

### Cookies & session

- Auth cookie is **HttpOnly** and **SameSite** per env.
- In production with `COOKIE_SECURE=true`, cookie name is prefixed with **`__Host-`**.
- `COOKIE_DOMAIN` **must be empty** when using `__Host-` prefix.

### Rate limiting & lockout

- Global limiter (100/15min dev, stricter in prod).
- Auth limiter (default 5/15min).
- Sensitive limiter for reset/forgot endpoints (half of auth limit, min 3).
- **Lockout** is in-memory with exponential backoff; use Redis in multi-instance prod.

### OAuth state storage

- OAuth `state` is handled by Supabase for the hosted OAuth flow.
- Do not override `state` manually in `queryParams`, as it can break callback validation.

---

## Frontend rules (thin client)

- **Never call Supabase directly**.
- **Always** use `credentials: "include"`.
- **Never store tokens** in localStorage/sessionStorage.
- **Do not decode JWTs**; backend is source of truth.
- Redirect to `/login` on `401` from protected calls.

### Token handling

- Supabase sends reset/verify tokens in the URL **hash** (`#access_token=...`).
- The frontend parses the hash and sends the token to `/auth/reset-password`.

---

## Shared types & validation

The `types/` package exports:

- Zod schemas (client + server)
- API response shapes
- Error code string unions

Backend uses **stronger password checks** (`zxcvbn` score >= 3) in `backend/src/validators/auth.validator.ts`.

---

## API surface

### Public

- `GET /health`
- `GET /auth/csrf-token`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/google/url`
- `GET /auth/google/callback` (called by Google, not frontend)

### Protected

- `GET /auth/me`
- `GET /admin/users`
- `GET /admin/users/:id`
- `POST /admin/users/create`
- `POST /admin/users/:id/update`
- `POST /admin/users/:id/delete`
- `POST /admin/users/:id/ban`
- `POST /admin/users/:id/unban`
- `POST /admin/users/bulk`
- `GET /admin/audit-logs`

### Admin authorization

- Admin access is enforced server-side via Supabase `app_metadata`.
- A user is considered admin when `app_metadata.role === "admin"` or `app_metadata.is_admin === true`.
- Never trust client-side role flags for authorization.

### Response shape

**Success**

```json
{ "success": true, "message": "...", "data": {} }
```

**Error**

```json
{ "success": false, "error": "ERROR_CODE", "message": "..." }
```

Error `details` are only included in development (see `error.middleware.ts`).

---

## Environment variables

### Backend (`backend/.env`)

**Required**

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FRONTEND_URL`

**Common Optional**

- `BACKEND_URL`, `PORT`, `NODE_ENV`
- Cookie: `COOKIE_NAME`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_MAX_AGE_DAYS`
- Rate limit: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `AUTH_RATE_LIMIT_MAX_REQUESTS`, `STRICT_RATE_LIMIT_MAX_REQUESTS`
- Security: `TRUST_PROXY`, `REQUEST_TIMEOUT_MS`, `MAX_REQUEST_SIZE`
- Lockout: `LOCKOUT_MAX_ATTEMPTS`, `LOCKOUT_DURATION_MS`

See `backend/.env.example` for the canonical list.

### Frontend (`frontend/.env.local`)

- `NEXT_PUBLIC_API_BASE_URL` (must point to backend)

---

## Commands

### Repo root (workspaces)

- `pnpm dev` — run backend + frontend in parallel
- `pnpm build` — build all packages
- `pnpm lint` — lint all packages
- `pnpm format` — format all packages
- `pnpm type-check` — typecheck all packages

### Backend

- `pnpm --filter @supabase-modular-auth/backend dev`
- `pnpm --filter @supabase-modular-auth/backend build`

### Frontend

- `pnpm --filter @supabase-modular-auth/frontend dev`
- `pnpm --filter @supabase-modular-auth/frontend build`

---

## Gotchas & notes

- **CORS** only allows `FRONTEND_URL` (and optionally `BACKEND_URL`) and only **GET/POST/OPTIONS**. If you add PUT/DELETE routes, update CORS.
- **Request-ID** header is `X-Request-ID` (set in middleware).
- **Error logs** are JSON; sensitive fields are redacted by logger.
- **Dark mode is intentionally disabled** in `frontend/app/globals.css` for readability.
- The backend is strict about payload sizes and timeouts (`MAX_REQUEST_SIZE`, `REQUEST_TIMEOUT_MS`).
- **Safari/ITP** may block third‑party cookies. Prefer same-origin proxying via `FRONTEND_PROXY_TARGET` or keep frontend/backend on the same site.

---

## Default agent behavior

- Prefer security over convenience.
- Do not introduce OTP/MFA or custom email systems.
- Do not hardcode project-specific values.
- Keep the frontend UI minimal and **backend-driven**.
- If unsure, follow Supabase Auth best practices.
- If any code change impact the documentation (AGENTS.md or any other MD file), update the documentation accordingly.
