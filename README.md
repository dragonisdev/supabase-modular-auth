# Supabase SaaS Starter

A generic TypeScript monorepo for a security-first SaaS: Next.js App Router, an Express API, shared Zod contracts, and Supabase Auth.

The browser never talks to Supabase directly. Next.js proxies same-origin API requests to Express, and Express owns cookies, token validation, authorization, and privileged Supabase access.

## Quick start

Requires Node.js 24 (or Node.js 22.18+) and pnpm 10.32.1.

```bash
pnpm install --frozen-lockfile
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
pnpm dev
```

Then open `http://localhost:3001`. A Docker-based development path is documented in [Setup](docs/setup.md#docker-compose-development).

## Workspace

- `frontend/` — Next.js UI and same-origin proxy
- `backend/` — Express auth/admin API
- `types/` — shared Zod and generated OpenAPI types
- `openapi/` — canonical API specification
- `test/` — unit, integration, contract, database, and opt-in live tests

## Documentation

- [Documentation index](docs/README.md)
- [Setup and deployment](docs/setup.md)
- [Architecture](docs/architecture/overview.md)
- [Environment variables and secrets](docs/configuration/environment.md)
- [API contract](docs/api/README.md)
- [Testing](docs/testing/README.md)
- [Contributor/agent rules](AGENTS.md)

This starter intentionally has no product branding or tenant-owned product schema yet. Add those only when the product domain is known.

License: ISC.
