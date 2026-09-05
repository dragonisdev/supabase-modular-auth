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

Use `rate-limit-redis` with `node-redis`. Each limiter has a distinct key namespace, while all backend instances in an environment share one Redis endpoint. Production requires `REDIS_URL` and verifies the connection with at most four initial attempts before the HTTP server listens. A configurable periodic Redis `PING` keeps long-lived external TCP connections active; it is portable across Redis providers and can be disabled. After the first successful connection, the client continues reconnecting with bounded exponential backoff. Runtime store errors fail closed and are normalized as service-unavailable responses; development and tests may deliberately omit Redis and use the process-local store.

The checked-in Compose stacks include an unexposed, internal-network Redis with persistence disabled because losing rate-limit counters on a full stack restart is acceptable. Railway may use its private Redis service or an external managed Redis-compatible TCP service. A two-VM topology must use one shared private/managed Redis, not one Redis per application VM.

## Security and operational consequences

- Redis is never browser-accessible and no Redis port is published by Compose.
- `REDIS_URL` is a backend-only secret; use `rediss://` when required by the provider.
- Redis availability is now part of backend availability. This is intentional: bypassing limits during an outage would weaken brute-force and abuse controls.
- Rate-limit storage does not make the entire backend horizontally safe. Account lockout, OAuth PKCE state, and the audit fallback remain process-local.
- Counter persistence and backups are unnecessary for this specific dataset. Monitor availability, memory, latency, rejected requests, and evictions instead.

## Revisit conditions

Revisit the topology when multi-region latency, Redis high availability, provider compliance, or materially higher request volume requires clustering or a managed service. Revisit the fail-closed policy only with a documented replacement control that preserves abuse resistance during store outages.
