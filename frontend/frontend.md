Frontend for the authentication API using Next.js 14 App Router. Keep UX minimal, secure, and driven entirely by backend responses.

## Table of Contents

- Overview
- Tech Stack
- Environment
- Security Rules
- Pages & Behaviors
- API Usage Patterns
- UX States
- Error Handling
- Folder Notes

## Overview

- Frontend is a thin client: no Supabase client, no token parsing, no local auth state beyond backend responses.
- All authentication happens on the backend; cookies are HttpOnly and managed server-side.
- Always treat backend as the source of truth for logged-in state.

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Fetch API (no Supabase client)

## Environment

- `NEXT_PUBLIC_API_BASE_URL` is the only required variable for API calls.
- Always send `credentials: 'include'` on fetch to carry cookies.

## Security Rules

- Never call Supabase directly; only talk to the backend API.
- Never store tokens in localStorage/sessionStorage; rely on HttpOnly cookies.
- Do not decode/inspect JWTs; trust backend responses.
- Redirect to `/login` on `401` from protected calls.

## Pages & Behaviors

- `/register`
  - Form: email, password.
  - POST `/auth/register` with JSON body.
  - On success: show "Check your email to verify"; stay on page.

- `/login`
  - Form: email, password.
  - POST `/auth/login` with credentials included.
  - On success: redirect to `/dashboard`.
  - Do not assume success without backend response.

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

- `/logout`
  - POST `/auth/logout` with credentials.
  - On success: redirect to `/login` and clear local UI state.

## API Usage Patterns

- All requests: `credentials: 'include'` and `Content-Type: application/json` for POST bodies.
- Never reuse cached auth state; rely on fresh `/auth/me` when rendering protected areas.
- Handle rate-limit responses generically ("Please try again later").
- Prefer `AbortController` for in-flight requests when navigating away.

## UX States

- Each form needs: idle, loading (disable submit), success message, generic error message.
- Show inline validation only for obvious client issues (e.g., empty fields); defer canonical errors to server.
- Keep layouts minimal and readable; avoid storing any auth data client-side.

## Error Handling

- Do not branch on specific error codes for UI copy; use generic friendly errors except where flows demand specifics:
  - Login: if `EMAIL_NOT_VERIFIED`, prompt to verify email.
  - Others: "Something went wrong. Please try again."
- On network failure: "Cannot reach server. Please try again."

## Folder Notes

- App routes live in `app/` per Next.js App Router conventions.
- Shared fetch helpers belong in `lib/api.ts`.
- Keep components page-scoped unless reused across flows.
