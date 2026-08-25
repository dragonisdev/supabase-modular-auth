## Features

- ✅ Email/Password Registration with Email Verification
- ✅ Email/Password Login (verified users only)
- ✅ Password Reset Flow
- ✅ Google OAuth Authentication
- ✅ Stateless JWT-based Authentication
- ✅ HttpOnly Cookie Management
- ✅ Rate Limiting
- ✅ Security Headers (Helmet)
- ✅ CORS Protection
- ✅ Input Validation (Zod)
- ✅ Type-safe Error Handling

## API documentation

### Base URL

```
http://localhost:3000
```

### Response format

**Success response**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error response**

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

### Authentication

All protected endpoints require a valid Supabase session. The access token is stored in the
HttpOnly cookie configured by `COOKIE_NAME` (default: `auth_token`), and the rotating refresh token
uses the derived `${COOKIE_NAME}_refresh` name (default: `auth_token_refresh`). Both names receive
the `__Host-` prefix in secure production mode.

### Admin authorization

Admin endpoints are protected by authentication + server-side admin checks.

- Source of truth: Supabase `app_metadata`
- Admin when: `role === "admin"` or `is_admin === true`
- Enforcement: backend middleware only (client checks are UX only)
- Rate limiting: higher allowance for admin reads (`GET`) and stricter limit for admin writes (`POST`) to avoid throttling normal panel navigation.
- Admin-created users now use the regular signup verification flow (verification email is sent by default unless explicitly confirmed).
- Admin user updates can edit role/admin flags, password, and moderation metadata (`banned`, `ban_reason`, `ban_expires_at`).
- Admin audit logs are persisted in Supabase table `public.admin_audit_logs`.
- Retention: backend triggers periodic purge via SQL function `public.admin_purge_audit_logs` (default 180 days).
- Immutability: audit rows are append-only (updates/deletes blocked except retention purge function).

### Supabase audit migration

- Apply: `backend/supabase/migrations/20260311_admin_audit_logs.sql`
- This migration creates:
  - `public.admin_audit_logs` table + indexes
  - mutation-prevention trigger (append-only enforcement)
  - `public.admin_purge_audit_logs(integer)` retention function
  - grants restricted to service role for backend access

### OAuth callback CSRF protection

- OAuth state validation is handled by Supabase during code exchange.
- Avoid manually overriding OAuth `state` values in authorization URL parameters.

### Endpoints

#### Admin endpoints

- `GET /admin/users`
- `GET /admin/users/:id`
- `POST /admin/users/create`
- `POST /admin/users/:id/update`
- `POST /admin/users/:id/delete`
- `POST /admin/users/:id/ban`
- `POST /admin/users/:id/unban`
- `POST /admin/users/bulk`
- `GET /admin/audit-logs`

All admin endpoints require a valid auth cookie and admin privileges.

#### Health check

**GET /health**

Check if the server is running.

**Response**

```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2025-12-24T10:00:00.000Z"
}
```

#### Register

**POST /auth/register**

Register a new user with email and password.

**Request body**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Password requirements**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success response (201)**

```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Error responses**

- `400 INVALID_INPUT`: Invalid email or password format
- `401 AUTH_FAILED`: Registration failed (non-enumerating)
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Users must verify their email before they can login
- Supabase sends verification email automatically
- Response is non-enumerating to prevent email discovery

#### Login

**POST /auth/login**

Login with email and password.

**Request body**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success response (200)**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    }
  }
}
```

Sets separate HttpOnly access and refresh cookies using `COOKIE_NAME` (default: `auth_token`) and
the derived `${COOKIE_NAME}_refresh` name (default: `auth_token_refresh`).

**Error responses**

- `400 INVALID_INPUT`: Invalid email or password format
- `401 AUTH_FAILED`: Invalid credentials (non-enumerating)
- `403 EMAIL_NOT_VERIFIED`: Email not verified
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Only verified users can login
- Access and refresh tokens are stored in separate HttpOnly cookies
- Access-cookie lifetime follows the JWT; refresh-cookie lifetime is a rolling seven days by default
- Frontend never sees either token

#### Logout

**POST /auth/logout**

Logout the current user.

**Success response (200)**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

Clears both authentication cookies.

**Notes**

- Invalidates the session in Supabase
- Clears both auth cookies even if Supabase logout fails

#### Forgot password

**POST /auth/forgot-password**

Request a password reset email.

**Request body**

```json
{
  "email": "user@example.com"
}
```

**Success response (200)**

```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Error responses**

- `400 INVALID_INPUT`: Invalid email format
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Always returns success to prevent email enumeration
- Supabase sends reset email if account exists
- Reset link redirects to frontend

#### Reset password

**POST /auth/reset-password**

Reset password using the token from email.

**Request body**

```json
{
  "password": "NewSecurePass123"
}
```

**Headers**

- Cookie configured by `COOKIE_NAME` (default: `auth_token`, from the reset link)

**Password requirements**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success response (200)**

```json
{
  "success": true,
  "message": "Password reset successful. Please login with your new password."
}
```

**Error responses**

- `400 INVALID_INPUT`: Invalid password format
- `401 AUTH_FAILED`: Invalid or expired reset token
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Requires valid reset token from email
- Token is consumed after successful reset
- Auth cookie is cleared after reset

#### Get Google OAuth URL

**GET /auth/google/url**

Get the Google OAuth authorization URL.

**Success response (200)**

```json
{
  "success": true,
  "message": "OAuth URL generated",
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }
}
```

**Error responses**

- `401 AUTH_FAILED`: Failed to generate OAuth URL

**Notes**

- Frontend should redirect user to this URL
- User completes OAuth on Google's site
- Google redirects to backend callback

#### Google OAuth callback

**GET /auth/google/callback**

Handle Google OAuth callback (used by Google, not frontend).

**Query parameters**

- `code`: Authorization code from Google

**Success**

- Sets HttpOnly access and refresh cookies
- Redirects to: `${FRONTEND_URL}/dashboard`

**Error**

- Redirects to: `${FRONTEND_URL}/auth/error`

**Notes**

- This endpoint is called by Google, not the frontend
- Backend exchanges code for session
- Frontend never touches OAuth tokens

#### Get current user

**GET /auth/me**

Get information about the currently authenticated user.

**Headers**

- Access and refresh cookies configured by `COOKIE_NAME` and the derived `${COOKIE_NAME}_refresh`
  name (defaults: `auth_token` and `auth_token_refresh`; automatically sent)

**Success response (200)**

```json
{
  "success": true,
  "message": "User retrieved",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "email_verified": true,
      "created_at": "2025-12-24T10:00:00.000Z"
    }
  }
}
```

**Error responses**

- `401 AUTH_FAILED`: Not authenticated or terminally invalid session
- `503 SERVICE_UNAVAILABLE`: Supabase validation is temporarily unavailable; cookies are preserved

**Notes**

- Requires a valid access or refresh cookie
- Validates the access JWT with Supabase on every request
- Transparently rotates both cookies when the access token has expired
- Clears both cookies only when the session is terminally invalid

## Security features

### Core security

- **HttpOnly cookies**: Access and refresh tokens stored separately, inaccessible to JavaScript
- **Rotating sessions**: Expired access tokens are refreshed on request-scoped Supabase clients
- **Rate limiting**: Prevents brute force attacks (5 attempts per 15 min for auth endpoints)
- **Helmet**: Security headers to prevent common vulnerabilities
- **CORS**: Restricts API access to authorized frontend origin
- **Input validation**: Validates all inputs with Zod schemas
- **Non-enumerating errors**: Prevents user enumeration attacks
- **Email verification**: Required before login
- **Stateless architecture**: No server-side session storage

### Security headers

The API includes the following security headers via Helmet:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)

### CORS policy

- **Allowed origin**: Configured via `FRONTEND_URL` environment variable
- **Credentials**: Enabled (allows cookies)
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization

### Cookie configuration

The access cookie configured by `COOKIE_NAME` and the derived `${COOKIE_NAME}_refresh` refresh
cookie (defaults: `auth_token` and `auth_token_refresh`) are set with:

- `httpOnly: true` - Not accessible via JavaScript
- `secure: true` - HTTPS only (in production)
- `sameSite: COOKIE_SAME_SITE` (`lax` by default) - Cookie policy and CSRF defense in depth
- Access `maxAge`: remaining Supabase JWT lifetime
- Refresh `maxAge`: rolling `COOKIE_MAX_AGE_DAYS` (seven days by default)
- `domain`: Configured via environment
- `path: /`

SameSite complements but does not replace the primary CSRF control: the non-HttpOnly `csrf_token`
cookie must match the `X-CSRF-Token` header on protected non-GET requests.

**Safari note:** If frontend and backend are on different sites, set `COOKIE_SAME_SITE=none` and `CSRF_COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true` (HTTPS). Safari may still block third‑party cookies; prefer same-site proxying.

### Rate limiting

**Global rate limit**

- **Window**: 15 minutes
- **Max requests**: 100 per window

**Auth endpoints rate limit**

- **Window**: 15 minutes
- **Max requests**: 5 per window
- **Applies to**:
  - POST /auth/register
  - POST /auth/login
  - POST /auth/forgot-password
  - POST /auth/reset-password

### Error codes

| Code                  | HTTP Status | Description                 |
| --------------------- | ----------- | --------------------------- |
| `AUTH_FAILED`         | 401         | Authentication failed       |
| `INVALID_INPUT`       | 400         | Invalid request data        |
| `EMAIL_NOT_VERIFIED`  | 403         | Email verification required |
| `UNAUTHORIZED`        | 401         | Unauthorized access         |
| `INTERNAL_ERROR`      | 500         | Internal server error       |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests           |

## Authentication flows

### Email/Password registration flow

1. User submits email and password to `/auth/register`
2. Backend validates input and creates user in Supabase
3. Supabase sends verification email
4. User clicks verification link in email
5. User can now login via `/auth/login`

### Email/Password login flow

1. User submits credentials to `/auth/login`
2. Backend validates with Supabase
3. Backend checks email verification status
4. Backend sets separate HttpOnly access and refresh cookies
5. User is authenticated

### Password reset flow

1. User requests reset via `/auth/forgot-password`
2. Supabase sends reset email with token
3. User clicks link (redirects to frontend with token)
4. Frontend sends new password to `/auth/reset-password`
5. Backend validates token and updates password
6. User must login with new password

### Google OAuth flow

1. Frontend requests OAuth URL via `/auth/google/url`
2. Frontend redirects user to Google
3. User authorizes on Google
4. Google redirects to `/auth/google/callback` with code
5. Backend exchanges code for session
6. Backend sets separate HttpOnly access and refresh cookies
7. Backend redirects to frontend dashboard
8. User is authenticated

**Setup checklist:**

- Enable Google provider in Supabase Auth settings.
- In Google Cloud OAuth client, set redirect URI to: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
- In Supabase Auth URL configuration, allow: `${BACKEND_URL}/auth/google/callback`.
- Set `BACKEND_URL` to the public frontend origin when using the Next.js proxy, so OAuth cookies are written on the frontend host. Use the backend origin only in direct cross-origin mode.

## Frontend integration

### Making authenticated requests

```javascript
// Cookies are sent automatically
fetch("http://localhost:3000/auth/me", {
  credentials: "include", // Required for cookies
});
```

### Handling errors

```javascript
const response = await fetch("http://localhost:3000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ email, password }),
});

const data = await response.json();

if (!data.success) {
  // Handle error based on error code
  switch (data.error) {
    case "EMAIL_NOT_VERIFIED":
      // Show verification reminder
      break;
    case "AUTH_FAILED":
      // Show invalid credentials message
      break;
    default:
    // Show generic error
  }
}
```

### OAuth integration

```javascript
// Get OAuth URL
const response = await fetch("http://localhost:3000/auth/google/url");
const { data } = await response.json();

// Redirect user to Google
window.location.href = data.url;
```

### Security best practices

1. **Never store JWT in localStorage or sessionStorage**
   - Use HttpOnly cookies only

2. **Always use HTTPS in production**
   - Set `COOKIE_SECURE=true`

3. **Implement proper CORS**
   - Configure `FRONTEND_URL` correctly

4. **Handle rate limits gracefully**
   - Show user-friendly messages
   - Implement exponential backoff

5. **Never expose sensitive errors**
   - All auth errors are normalized

6. **Validate input on frontend too**
   - Improves UX and reduces server load

## Project structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts              # Environment configuration
│   ├── controllers/
│   │   └── auth.controller.ts  # Authentication logic
│   ├── middleware/
│   │   ├── auth.middleware.ts  # JWT verification
│   │   └── error.middleware.ts # Error handling
│   ├── routes/
│   │   └── auth.routes.ts      # Route definitions
│   ├── services/
│   │   ├── session.service.ts  # Verification and refresh rotation
│   │   └── supabase.service.ts # Supabase clients
│   ├── utils/
│   │   ├── errors.ts           # Custom error classes
│   │   └── response.ts         # Response helpers
│   ├── validators/
│   │   └── auth.validator.ts   # Zod schemas
│   ├── app.ts                  # Express app setup
│   └── index.ts                # Entry point
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

## Environment variables

### Required

| Variable                    | Description                       |
| --------------------------- | --------------------------------- |
| `SUPABASE_URL`              | Your Supabase project URL         |
| `SUPABASE_ANON_KEY`         | Supabase anonymous key            |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key         |
| `FRONTEND_URL`              | Frontend application URL for CORS |

### Optional - Server

| Variable      | Description                                                 | Default       |
| ------------- | ----------------------------------------------------------- | ------------- |
| `PORT`        | Server port                                                 | `3000`        |
| `NODE_ENV`    | Environment mode                                            | `development` |
| `BACKEND_URL` | Public OAuth callback origin; frontend origin in proxy mode | -             |

### Optional - Cookies

| Variable              | Description                                      | Default      |
| --------------------- | ------------------------------------------------ | ------------ |
| `COOKIE_NAME`         | Access cookie base name; refresh adds `_refresh` | `auth_token` |
| `COOKIE_DOMAIN`       | Cookie domain                                    | -            |
| `COOKIE_SECURE`       | Use secure cookies (HTTPS)                       | `false`      |
| `COOKIE_SAME_SITE`    | SameSite attribute                               | `lax`        |
| `COOKIE_MAX_AGE_DAYS` | Rolling refresh-cookie browser lifetime (days)   | `7`          |

### Optional - CSRF cookie

| Variable                | Description                                          | Default  |
| ----------------------- | ---------------------------------------------------- | -------- |
| `CSRF_COOKIE_SAME_SITE` | SameSite for CSRF cookie                             | `strict` |
| `CSRF_COOKIE_SECURE`    | Secure flag for CSRF cookie (inherits COOKIE_SECURE) | -        |

### Optional - Rate limiting

| Variable                         | Description                   | Default  |
| -------------------------------- | ----------------------------- | -------- |
| `RATE_LIMIT_WINDOW_MS`           | Rate limit window (ms)        | `900000` |
| `RATE_LIMIT_MAX_REQUESTS`        | Max requests per window       | `100`    |
| `AUTH_RATE_LIMIT_MAX_REQUESTS`   | Max auth requests per window  | `5`      |
| `STRICT_RATE_LIMIT_MAX_REQUESTS` | Stricter limit for production | `20`     |

### Optional - Security

| Variable             | Description                        | Default |
| -------------------- | ---------------------------------- | ------- |
| `TRUST_PROXY`        | Trust proxy headers (1/true/false) | `1`     |
| `REQUEST_TIMEOUT_MS` | Request timeout (ms)               | `30000` |
| `MAX_REQUEST_SIZE`   | Max request body size              | `10kb`  |

### Optional - Account lockout

| Variable               | Description                    | Default  |
| ---------------------- | ------------------------------ | -------- |
| `LOCKOUT_MAX_ATTEMPTS` | Failed attempts before lockout | `5`      |
| `LOCKOUT_DURATION_MS`  | Lockout duration (ms)          | `900000` |
