---
name: saas-ui
description: >-
  Implement or review user-facing SaaS interfaces in this repository's Next.js
  frontend, including layouts, components, interaction states, accessibility,
  and responsive behavior. Use for work under frontend/; do not use for
  backend-only, database, infrastructure, or documentation tasks.
---

# SaaS UI

Create cohesive, production-usable interfaces without changing the repository's authentication or authorization boundaries.

## Preserve repository boundaries

- Keep the frontend thin. Use `frontend/lib/api.ts` and shared schemas and types; never add a frontend Supabase client, decode JWTs, or persist tokens.
- Keep `credentials: "include"`, CSRF initialization, and backend-managed session rotation intact.
- Treat client-side role checks as navigation and presentation only. Express remains the authorization boundary.
- Preserve the distinction between Next.js `/admin/*` pages and proxied `/api/admin/*` backend requests.
- Redirect terminal `401` responses to login. Treat `SERVICE_UNAVAILABLE` and `CONNECTION_FAILED` as retryable without discarding the session.
- Do not change backend contracts, security policy, or dependencies merely to simplify visual work unless explicitly requested.

## Make deliberate UI decisions

- Use neutral "SaaS Starter" branding until a product name, audience, and visual identity are defined. Do not invent pricing, testimonials, metrics, or industry claims.
- Extend existing Tailwind and shared-component patterns before adding abstractions or UI dependencies.
- Give each networked flow all applicable states: initial loading, success, empty data, validation failure, authorization failure, retryable service failure, rate limiting, and generic error.
- Prevent duplicate submissions and clearly distinguish concurrent actions such as password login and OAuth redirect.
- Require confirmation and visible completion feedback for destructive admin actions.
- Keep controls semantic, keyboard-operable, visibly focused, properly labelled, and associated with errors or hints. Announce important asynchronous feedback accessibly.
- Verify narrow and wide layouts. Tables and admin controls must remain usable without unintended page-level horizontal overflow.
- Dark mode is currently disabled because of contrast problems. Do not re-enable it without verifying every affected route and state.

## Work and verify

1. Read the existing route, shared components, API helper, shared schemas, and relevant [frontend architecture](../../../docs/architecture/frontend.md) before changing a flow.
2. Implement the smallest coherent interface change, preserving existing route and component conventions.
3. Run at minimum:

   ```bash
   pnpm --filter @supabase-modular-auth/types build
   pnpm --filter @supabase-modular-auth/frontend type-check
   pnpm --filter @supabase-modular-auth/frontend build
   pnpm lint
   ```

4. Run relevant tests when behavior or API integration changes.
5. Render each changed route at narrow and desktop widths. Exercise keyboard navigation and every applicable loading, empty, success, and error state. Do not claim visual verification if the route was not rendered.
6. Confirm requests still use the expected `/auth/*` or `/api/admin/*` paths and that no Supabase access or token storage entered frontend code.
7. Update maintained documentation when routes, behavior, configuration, or documented invariants change.
