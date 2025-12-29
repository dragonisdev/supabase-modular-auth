# Authentication Frontend

A Next.js 14 authentication frontend that communicates with a backend API.

## Features

- ✅ User Registration with Email Verification
- ✅ User Login
- ✅ Password Recovery Flow
- ✅ Password Reset
- ✅ Protected Dashboard
- ✅ Logout Functionality
- ✅ HttpOnly Cookie-based Authentication

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
- `/forgot-password` - Request password reset
- `/reset-password` - Reset password with token
- `/dashboard` - Protected user dashboard
- `/logout` - Logout and redirect to login

## Security Features

- HttpOnly cookies for authentication
- No client-side token storage
- Credentials included in all API requests
- Protected routes with automatic redirect
- Non-enumerating error messages

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Fetch API

## Important Notes

- Frontend NEVER interacts with Supabase directly
- All authentication is handled by the backend API
- Always use `credentials: 'include'` in fetch requests
- Auth state is determined by API responses only

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.
