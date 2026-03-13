## Overview

- Frontend is a thin client: no Supabase client, no token parsing, no local auth state beyond backend responses.
- All authentication happens on the backend; cookies are HttpOnly and managed server-side.
- Always treat backend as the source of truth for logged-in state.

## Environment

- `NEXT_PUBLIC_API_BASE_URL` is the only required variable for API calls.
- **Optional**: `FRONTEND_PROXY_TARGET` enables same-origin proxying for Safari-friendly cookies.
- When using proxying, set `NEXT_PUBLIC_API_BASE_URL` to empty/undefined to use relative `/auth/*` paths.
- Always send `credentials: 'include'` on fetch to carry cookies.

## Security rules

- Never call Supabase directly; only talk to the backend API.
- Never store tokens in localStorage/sessionStorage; rely on HttpOnly cookies.
- Do not decode/inspect JWTs; trust backend responses.
- Redirect to `/login` on `401` from protected calls.

## Pages & behaviors

- `/register`
  - Form: email, password.
  - POST `/auth/register` with JSON body.
  - On success: show "Check your email to verify"; stay on page.

- `/auth/verify`
  - Handles Supabase verification redirects.
  - Supports both callback formats: query code (`?code=...`) and hash token (`#access_token=...`).

- `/login`
  - Form: email, password.
  - POST `/auth/login` with credentials included.
  - On success: redirect to `/dashboard`.
  - Do not assume success without backend response.
  - Google OAuth: call `GET /auth/google/url` and redirect to the returned URL.

- `/forgot-password`
  - Form: email.
  - POST `/auth/forgot-password`.
  - Always show success confirmation, regardless of existence.

- `/reset-password`
  - Form: new password + confirmation.
  - POST `/auth/reset-password` (token is in cookie from email link).
  - On success: prompt to log in.

- `/dashboard`
  - Protected view.
  - GET `/auth/me` with credentials.
  - On `401`: redirect to `/login`.

- `/admin`
  - Admin home.
  - Requires `/auth/me` success with `user.is_admin === true`.
  - Non-admin users are redirected to `/dashboard`.

- `/admin/users`
  - Admin user management table.
  - Uses `/admin/users`, `/admin/users/:id/*`, and `/admin/users/bulk`.

- `/admin/audit`
  - Admin audit feed.
  - Uses `GET /admin/audit-logs`.

- `/logout`
  - POST `/auth/logout` with credentials.
  - On success: redirect to `/login` and clear local UI state.

## API usage patterns

- All requests: `credentials: 'include'` and `Content-Type: application/json` for POST bodies.
- When using `FRONTEND_PROXY_TARGET`, call `/auth/*` relative routes so cookies remain first-party.
- Never reuse cached auth state; rely on fresh `/auth/me` when rendering protected areas.
- Handle rate-limit responses generically ("Please try again later").
- Prefer `AbortController` for in-flight requests when navigating away.
- Be resilient to malformed/non-JSON responses from upstreams; fallback to safe generic errors.

## UX states

- Each form needs: idle, loading (disable submit), success message, generic error message.
- Show inline validation only for obvious client issues (e.g., empty fields); defer canonical errors to server.
- Keep layouts minimal and readable; avoid storing any auth data client-side.
- Keep form controls keyboard-accessible (excluding password visibility toggles) and expose input error state via `aria-invalid` + `aria-describedby`.

## Error handling

- Do not branch on specific error codes for UI copy; use generic friendly errors except where flows demand specifics:
  - Login: if `EMAIL_NOT_VERIFIED`, prompt to verify email.
  - Others: "Something went wrong. Please try again."
- On network failure: "Cannot reach server. Please try again."

## Safari & Cross-Site cookies

Safari blocks many third-party cookies. If frontend and backend are on **different sites**, HttpOnly cookies may not be stored.

**Recommended approach:** set `FRONTEND_PROXY_TARGET` and use relative `/auth/*` calls to keep cookies first-party.

When using the proxy, set `NEXT_PUBLIC_API_BASE_URL` to an empty string (or omit it) so the client calls relative paths.

If you must stay cross-site, configure backend cookies with `SameSite=None` and `Secure` (HTTPS). Safari may still block them.

## Folder notes

- App routes live in `app/` per Next.js App Router conventions.
- Shared fetch helpers belong in `lib/api.ts`.
- Keep components page-scoped unless reused across flows.
