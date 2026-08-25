# Deployment guide

## Frontend on Vercel

1. Create a new project.
2. Import the Git repository.
3. It will auto-select the backend, but select the root directory → frontend (let it load the Next.js icon for auto-setup).
4. Change the build command to: `cd .. && pnpm --filter @supabase-modular-auth/types build && pnpm --filter @supabase-modular-auth/frontend build`
5. Change the install command to: `cd .. && pnpm i --frozen-lockfile`
6. Add environment variable: `FRONTEND_PROXY_TARGET` with a dummy value (for now), later we will use railway backend URL for it.
7. `NEXT_PUBLIC_API_BASE_URL` can be left empty as an env variable

## Backend on Railway

1. Create a new project.
2. Select the GitHub repository.
3. It will create 2 ndoes. If for some reason only one node appears (they're stacked), go to frontend and → settings → Delete Service at the bottom.
4. Go to backend → settings.
5. Choose a closer region if you wish (the closest to the Supabase region is better).
6. Enable Railpack builder with metal build (it worked just fine).
7. Set custom build command: `pnpm run --filter=@supabase-modular-auth/types build && pnpm run --filter=@supabase-modular-auth/backend build`
8. The start command is already perfect.
9. Set environment variables:
   - Delete the pre-filled `FRONTEND_URL`.
   - `BACKEND_URL=https://supabase-repro-frontend-b5e8.vercel.app` (the public Vercel URL you got, no trailing slash)
   - `COOKIE_SAME_SITE=none`
   - `COOKIE_SECURE=true`
   - `CSRF_COOKIE_SAME_SITE=none`
   - `CSRF_COOKIE_SECURE=true`
   - `FRONTEND_URL=https://supabase-repro-frontend-b5e8.vercel.app` (same as above)
   - `NODE_ENV=${{RAILWAY_ENVIRONMENT_NAME}}`
   - `PORT=3000`
   - `SUPABASE_ANON_KEY=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
   - `SUPABASE_URL=...`
10. Hit deploy.
11. Once done, get your Railway public backend URL (e.g., `https://backend-production-2d74.up.railway.app`), copy-paste it into the `FRONTEND_PROXY_TARGET` env var of Vercel (no trailing slash) and redeploy.
12. Just in case it's not working, redeploy both services again.

## Supabase project configuration

1. Go to Authentication → URL Configuration.
2. Set Site URL to the production Vercel origin without a trailing slash, for example
   `https://your-frontend.vercel.app`.
3. Add the exact production Redirect URLs:
   - `https://your-frontend.vercel.app/auth/google/callback`
   - `https://your-frontend.vercel.app/auth/verify`
   - `https://your-frontend.vercel.app/reset-password`
4. In the recommended Next.js proxy mode, Supabase redirects through the frontend origin, so the
   Railway backend URL does not need to be allowlisted.
5. Prefer exact production URLs. If preview or local deployments require a wildcard, use `/**`, not
   `/*`; Supabase's single `*` does not match nested paths.

## Google OAuth setup

1. Create a Google OAuth project.
2. Set up OAuth flow.
3. Configure client as web application.
4. Set accepted JavaScript origins to the Vercel and Railway URLs.
5. Set redirect URI to the Supabase callback URL, e.g., `https://mbszdsxfizjvjehtybzw.supabase.co/auth/v1/callback` (get this when activating Supabase Google OAuth).

And now it will work!
