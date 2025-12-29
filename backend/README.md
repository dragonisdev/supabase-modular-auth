# Backend - Authentication API

Express.js + TypeScript + Supabase Auth. Stateless, secure, production-ready.

## Quick Start

```bash
pnpm i --frozen-lockfile
cp .env.example .env  # Edit with your Supabase credentials
pnpm dev              # http://localhost:3000
```

Test: `curl http://localhost:3000/health`

## Docs

- **[backend.md](backend.md)** - API reference

## Project Structure

```
src/
├── config/       # Env validation
├── controllers/  # Business logic
├── middleware/   # Auth, errors, tracking
├── routes/       # API endpoints
├── services/     # Supabase, lockout
├── utils/        # Errors, logging
└── validators/   # Input validation
```

## Environment

Get from [Supabase Dashboard](https://supabase.com/dashboard):

```env
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxx
FRONTEND_URL=http://localhost:3001

# Optional - Server
PORT=3000
NODE_ENV=development
BACKEND_URL=http://localhost:3000

# Optional - Cookies
COOKIE_NAME=auth_token
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
COOKIE_MAX_AGE_DAYS=7

# Optional - Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=5

# Optional - Security
TRUST_PROXY=1
REQUEST_TIMEOUT_MS=30000
MAX_REQUEST_SIZE=10kb

# Optional - Lockout
LOCKOUT_MAX_ATTEMPTS=5
LOCKOUT_DURATION_MS=900000
```

## Architecture

Request → Middleware → Routes → Controllers → Services → Supabase

- Stateless (JWT in HttpOnly cookies)
- Per-IP rate limiting (100/15min general, 5/15min auth)
- Zod input validation
- Strict TypeScript
- Security: Helmet, CORS, XSS protection, account lockout

## Adding Features

1. Add Zod schema in `validators/`
2. Add controller method in `controllers/`
3. Add route in `routes/`

Example:

```typescript
// validators/auth.validator.ts
export const mySchema = z.object({ field: z.string() });

// controllers/auth.controller.ts
async myMethod(req, res, next) {
  try {
    const { field } = mySchema.parse(req.body);
    // Logic here
    successResponse(res, 'Success', result);
  } catch (error) {
    next(error);
  }
}

// routes/auth.routes.ts
router.post('/endpoint', authLimiter, (req, res, next) =>
  controller.myMethod(req, res, next)
);
```

## Security

- CSRF protection (Double Submit Cookie)
- Rate limiting per IP
- Account lockout (5 fails → 15 min)
- Password strength (zxcvbn)
- XSS sanitization
- Security event logging

⚠️ **Production:** Lockout uses in-memory storage. Add Redis for multi-instance.

## Commands

```bash
pnpm dev        # Dev server
pnpm build      # Production build
pnpm type-check # Check types
```
