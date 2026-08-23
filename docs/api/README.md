# API contract

The canonical API specification is [`openapi/openapi.yaml`](../../openapi/openapi.yaml). It covers all current Express health, authentication, session, OAuth, and admin operations.

Useful commands:

```bash
pnpm api:generate
pnpm api:check
```

Generated TypeScript is exported by `@supabase-modular-auth/types`. Update the Express route, OpenAPI operation, tests, and generated snapshot together.

All application JSON responses use one of these envelopes:

```json
{ "success": true, "message": "...", "data": {} }
```

```json
{ "success": false, "error": "ERROR_CODE", "message": "..." }
```

Development-only error details are not part of the production contract.
