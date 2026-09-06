# 0001: Redis for shared rate limiting

Status: accepted

## Context and constraints

Express currently applies global, authentication, sensitive-auth, admin-read, and admin-write limits. Process-memory counters reset on restart and are independent per process, so adding a backend instance multiplies the effective quota. The target deployments are Railway initially, a single VM, and potentially two VMs later.

The rate-limit path is a security control. Losing the shared store must not silently disable it, and connection URLs may contain credentials that must never reach logs or the frontend.

## Options considered

- Keep the built-in memory store: simplest, but only correct for one process and counters disappear on restart.
- Store counters in Supabase/PostgreSQL: durable but adds database write pressure and latency to every request.
- Use Redis-compatible shared storage: atomic expiring counters, low request-path latency, and straightforward support on Railway or a private VM network.

## Decision

Use `rate-limit-redis` with a selectable command transport: `node-redis` TCP (default) or Upstash REST over HTTPS. Both retain the same atomic Lua scripts, quotas and key namespaces. TCP requires `REDIS_TCP_CONNECTION_URL` in production and verifies the connection with at most four initial attempts before listening. Its configurable periodic PING and bounded reconnect backoff remain available for long-lived TCP deployments.

REST is an alternative for deployments experiencing persistent TCP connectivity problems. It uses Node's built-in `fetch` with [Upstash's JSON command protocol](https://upstash.com/docs/redis/features/restapi), avoiding an additional SDK dependency. It requires an HTTPS REST URL and read/write token, uses a deadline per command and a single startup PING, and has no periodic keepalive. It does not automatically retry counter writes because a failed response can follow a successful increment. Preserve `NOSCRIPT` so the limiter can reload evicted scripts. Runtime failures in either transport fail closed with `503`; only development/test with TCP selected and no URL may deliberately use memory. REST does not provide fallback during provider outages.

The checked-in Compose stacks include an unexposed, internal-network Redis with persistence disabled because losing rate-limit counters on a full stack restart is acceptable. Railway may use its private Redis service, an external managed TCP service, or Upstash REST. A two-VM topology must use one shared private/managed Redis, not one Redis per application VM.

## Security and operational consequences

- Redis is never browser-accessible and no Redis port is published by Compose.
- `REDIS_TCP_CONNECTION_URL` and the Upstash REST token are backend-only secrets; external connections use TLS. REST credentials are sent in the Authorization header and redirects are rejected.
- Redis availability is now part of backend availability. This is intentional: bypassing limits during an outage would weaken brute-force and abuse controls.
- Rate-limit storage does not make the entire backend horizontally safe. Account lockout, OAuth PKCE state, and the audit fallback remain process-local.
- Counter persistence and backups are unnecessary for this specific dataset. Monitor availability, memory, latency, rejected requests, and evictions instead.

## Revisit conditions

Revisit the topology when multi-region latency, Redis high availability, provider compliance, or materially higher request volume requires clustering or a managed service. Revisit the fail-closed policy only with a documented replacement control that preserves abuse resistance during store outages.
