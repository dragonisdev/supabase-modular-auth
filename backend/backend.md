# Backend Authentication API

A stateless backend authentication API built with Node.js, TypeScript, Express, and Supabase Auth.

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

## Table of Contents

- [API Documentation](#api-documentation)
- [Security Features](#security-features)
- [Authentication Flows](#authentication-flows)
- [Frontend Integration](#frontend-integration)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)

---

## API Documentation

### Base URL

```
http://localhost:3000
```

### Response Format

**Success Response**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { }
}
```

**Error Response**

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

### Authentication

All protected endpoints require a valid JWT token stored in an HttpOnly cookie named `auth_token`.

---

### Endpoints

#### Health Check

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

---

#### Register

**POST /auth/register**

Register a new user with email and password.

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Password Requirements**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success Response (201)**

```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Error Responses**

- `400 INVALID_INPUT`: Invalid email or password format
- `401 AUTH_FAILED`: Registration failed (non-enumerating)
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Users must verify their email before they can login
- Supabase sends verification email automatically
- Response is non-enumerating to prevent email discovery

---

#### Login

**POST /auth/login**

Login with email and password.

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200)**

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

Sets HttpOnly cookie: `auth_token`

**Error Responses**

- `400 INVALID_INPUT`: Invalid email or password format
- `401 AUTH_FAILED`: Invalid credentials (non-enumerating)
- `403 EMAIL_NOT_VERIFIED`: Email not verified
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Only verified users can login
- Access token stored in HttpOnly cookie
- Frontend never sees the JWT token

---

#### Logout

**POST /auth/logout**

Logout the current user.

**Success Response (200)**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

Clears the `auth_token` cookie.

**Notes**

- Invalidates the session in Supabase
- Clears auth cookie even if Supabase logout fails

---

#### Forgot Password

**POST /auth/forgot-password**

Request a password reset email.

**Request Body**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200)**

```json
{
  "success": true,
  "message": "If an account exists with this email, a password reset link has been sent."
}
```

**Error Responses**

- `400 INVALID_INPUT`: Invalid email format
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Always returns success to prevent email enumeration
- Supabase sends reset email if account exists
- Reset link redirects to frontend

---

#### Reset Password

**POST /auth/reset-password**

Reset password using the token from email.

**Request Body**

```json
{
  "password": "NewSecurePass123"
}
```

**Headers**

- Cookie: `auth_token` (from reset link)

**Password Requirements**

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Success Response (200)**

```json
{
  "success": true,
  "message": "Password reset successful. Please login with your new password."
}
```

**Error Responses**

- `400 INVALID_INPUT`: Invalid password format
- `401 AUTH_FAILED`: Invalid or expired reset token
- `429 RATE_LIMIT_EXCEEDED`: Too many attempts

**Notes**

- Requires valid reset token from email
- Token is consumed after successful reset
- Auth cookie is cleared after reset

---

#### Get Google OAuth URL

**GET /auth/google/url**

Get the Google OAuth authorization URL.

**Success Response (200)**

```json
{
  "success": true,
  "message": "OAuth URL generated",
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  }
}
```

**Error Responses**

- `401 AUTH_FAILED`: Failed to generate OAuth URL

**Notes**

- Frontend should redirect user to this URL
- User completes OAuth on Google's site
- Google redirects to backend callback

---

#### Google OAuth Callback

**GET /auth/google/callback**

Handle Google OAuth callback (used by Google, not frontend).

**Query Parameters**

- `code`: Authorization code from Google

**Success**

- Sets HttpOnly cookie: `auth_token`
- Redirects to: `${FRONTEND_URL}/dashboard`

**Error**

- Redirects to: `${FRONTEND_URL}/auth/error`

**Notes**

- This endpoint is called by Google, not the frontend
- Backend exchanges code for session
- Frontend never touches OAuth tokens

---

#### Get Current User

**GET /auth/me**

Get information about the currently authenticated user.

**Headers**

- Cookie: `auth_token` (automatically sent)

**Success Response (200)**

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

**Error Responses**

- `401 AUTH_FAILED`: Not authenticated or invalid session

**Notes**

- Requires valid auth cookie
- Validates JWT on every request
- Clears cookie if session is invalid

---

## Security Features

### Core Security

- **HttpOnly Cookies**: Access tokens stored securely, inaccessible to JavaScript
- **Rate Limiting**: Prevents brute force attacks (5 attempts per 15 min for auth endpoints)
- **Helmet**: Security headers to prevent common vulnerabilities
- **CORS**: Restricts API access to authorized frontend origin
- **Input Validation**: Validates all inputs with Zod schemas
- **Non-Enumerating Errors**: Prevents user enumeration attacks
- **Email Verification**: Required before login
- **Stateless Architecture**: No server-side session storage

### Security Headers

The API includes the following security headers via Helmet:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)

### CORS Policy

- **Allowed Origin**: Configured via `FRONTEND_URL` environment variable
- **Credentials**: Enabled (allows cookies)
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization

### Cookie Configuration

The `auth_token` cookie is set with:

- `httpOnly: true` - Not accessible via JavaScript
- `secure: true` - HTTPS only (in production)
- `sameSite: 'lax'` - CSRF protection
- `maxAge: 7 days`
- `domain`: Configured via environment
- `path: /`

### Rate Limiting

**Global Rate Limit**

- **Window**: 15 minutes
- **Max Requests**: 100 per window

**Auth Endpoints Rate Limit**

- **Window**: 15 minutes
- **Max Requests**: 5 per window
- **Applies to**:
  - POST /auth/register
  - POST /auth/login
  - POST /auth/forgot-password
  - POST /auth/reset-password

### Error Codes

| Code                  | HTTP Status | Description                 |
| --------------------- | ----------- | --------------------------- |
| `AUTH_FAILED`         | 401         | Authentication failed       |
| `INVALID_INPUT`       | 400         | Invalid request data        |
| `EMAIL_NOT_VERIFIED`  | 403         | Email verification required |
| `UNAUTHORIZED`        | 401         | Unauthorized access         |
| `INTERNAL_ERROR`      | 500         | Internal server error       |
| `RATE_LIMIT_EXCEEDED` | 429         | Too many requests           |

---

## Authentication Flows

### Email/Password Registration Flow

1. User submits email and password to `/auth/register`
2. Backend validates input and creates user in Supabase
3. Supabase sends verification email
4. User clicks verification link in email
5. User can now login via `/auth/login`

### Email/Password Login Flow

1. User submits credentials to `/auth/login`
2. Backend validates with Supabase
3. Backend checks email verification status
4. Backend sets HttpOnly cookie with JWT
5. User is authenticated

### Password Reset Flow

1. User requests reset via `/auth/forgot-password`
2. Supabase sends reset email with token
3. User clicks link (redirects to frontend with token)
4. Frontend sends new password to `/auth/reset-password`
5. Backend validates token and updates password
6. User must login with new password

### Google OAuth Flow

1. Frontend requests OAuth URL via `/auth/google/url`
2. Frontend redirects user to Google
3. User authorizes on Google
4. Google redirects to `/auth/google/callback` with code
5. Backend exchanges code for session
6. Backend sets HttpOnly cookie
7. Backend redirects to frontend dashboard
8. User is authenticated

---

## Frontend Integration

### Making Authenticated Requests

```javascript
// Cookies are sent automatically
fetch('http://localhost:3000/auth/me', {
  credentials: 'include' // Required for cookies
})
```

### Handling Errors

```javascript
const response = await fetch('http://localhost:3000/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ email, password })
});

const data = await response.json();

if (!data.success) {
  // Handle error based on error code
  switch (data.error) {
    case 'EMAIL_NOT_VERIFIED':
      // Show verification reminder
      break;
    case 'AUTH_FAILED':
      // Show invalid credentials message
      break;
    default:
      // Show generic error
  }
}
```

### OAuth Integration

```javascript
// Get OAuth URL
const response = await fetch('http://localhost:3000/auth/google/url');
const { data } = await response.json();

// Redirect user to Google
window.location.href = data.url;
```

### Security Best Practices

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

---

## Project Structure

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
│   │   └── supabase.service.ts # Supabase client
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

## Environment Variables

### Required

| Variable                    | Description                       |
| --------------------------- | --------------------------------- |
| `SUPABASE_URL`              | Your Supabase project URL         |
| `SUPABASE_ANON_KEY`         | Supabase anonymous key            |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key         |
| `FRONTEND_URL`              | Frontend application URL for CORS |

### Optional - Server

| Variable      | Description             | Default       |
| ------------- | ----------------------- | ------------- |
| `PORT`        | Server port             | `3000`        |
| `NODE_ENV`    | Environment mode        | `development` |
| `BACKEND_URL` | Backend URL (for OAuth) | -             |

### Optional - Cookies

| Variable              | Description                | Default      |
| --------------------- | -------------------------- | ------------ |
| `COOKIE_NAME`         | Auth cookie name           | `auth_token` |
| `COOKIE_DOMAIN`       | Cookie domain              | -            |
| `COOKIE_SECURE`       | Use secure cookies (HTTPS) | `false`      |
| `COOKIE_SAME_SITE`    | SameSite attribute         | `lax`        |
| `COOKIE_MAX_AGE_DAYS` | Cookie expiration (days)   | `7`          |

### Optional - Rate Limiting

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

### Optional - Account Lockout

| Variable               | Description                    | Default  |
| ---------------------- | ------------------------------ | -------- |
| `LOCKOUT_MAX_ATTEMPTS` | Failed attempts before lockout | `5`      |
| `LOCKOUT_DURATION_MS`  | Lockout duration (ms)          | `900000` |

## License

ISC
