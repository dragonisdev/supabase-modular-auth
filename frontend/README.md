# Authentication frontend

A Next.js 16 authentication frontend that communicates with a backend API.

## Features

- ✅ User Registration with Email Verification
- ✅ User Login
- ✅ Password Recovery Flow
- ✅ Password Reset
- ✅ Protected Dashboard
- ✅ Logout Functionality
- ✅ HttpOnly Cookie-based Authentication
- ✅ Admin Panel (`/admin`) with user management and audit logs

## Setup

1. Install dependencies:

```bash
pnpm i --frozen-lockfile
```

2. Create `.env.local` file:

```bash
cp .env.example .env.local
```

3. Configure environment variables:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000

# Optional: same-origin proxy (recommended for Safari)
# FRONTEND_PROXY_TARGET=http://localhost:3000
```

4. Start the development server:

```bash
pnpm dev
```

The app will be available at `http://localhost:3001`

## Pages

- `/` - Home page with navigation links
- `/register` - User registration
- `/login` - User login
- `/login` - User login (includes Google OAuth button)
- `/forgot-password` - Request password reset
- `/reset-password` - Reset password with token
- `/dashboard` - Protected user dashboard
- `/admin` - Admin panel home (admin only)
- `/admin/users` - User management (admin only)
- `/admin/audit` - Admin audit logs (admin only)
- `/logout` - Logout and redirect to login

## Security features

- HttpOnly cookies for authentication
- No client-side token storage
- Credentials included in all API requests
- Protected routes with automatic redirect
- Non-enumerating error messages

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Fetch API

## Google OAuth example

```ts
const response = await api.getGoogleAuthUrl();
if (response.success && response.data?.url) {
  window.location.href = response.data.url;
}
```

## Important notes

- Frontend NEVER interacts with Supabase directly
- All authentication is handled by the backend API
- Always use `credentials: 'include'` in fetch requests
- Auth state is determined by API responses only
- Admin UI relies on `/auth/me` returning `is_admin` in the user payload
