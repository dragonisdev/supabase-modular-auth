---
name: saas-architecture
description: >-
  Plan or implement architectural changes that cross frontend, Express, shared
  contracts, Supabase data, tests, or operations in this SaaS monorepo. Use for
  new capabilities and consequential security, tenancy, data, or deployment
  decisions; do not use for isolated copy, styling, or local refactors that
  preserve existing boundaries.
---

# SaaS Architecture

Design the smallest coherent change that satisfies the known requirement while preserving the repository's security and contract boundaries.

## Activation boundary

Use this playbook when a change:

- Affects two or more packages or operational layers.
- Introduces a domain capability, API, migration, integration, or shared abstraction.
- Changes authentication, authorization, tenancy, data ownership, deployment, or scaling assumptions.

Do not use it for isolated UI copy, styling, mechanical cleanup, or a single-package fix whose external contract and architecture remain unchanged. Activation does not authorize unrelated features or infrastructure.

## Establish current truth

Read the relevant parts of [`AGENTS.md`](../../../AGENTS.md), the [architecture overview](../../../docs/architecture/overview.md), and the actual implementation before designing. Open focused architecture, contract, migration, testing, and decision docs only when relevant.

State the current capability, concrete gap, and any assumption that would materially change the design. Do not infer product requirements from generic SaaS conventions. User/admin roles are authorization attributes, not evidence of tenant membership or tenant-owned data. This starter does not yet have a substantive tenancy model.

## Preserve invariants

- Express remains the security boundary. Authentication, authorization, privileged Supabase access, cookies, CSRF policy, and other security-sensitive operations stay in the backend.
- Next.js remains a thin presentation and same-origin proxy layer. Never move Supabase service credentials or token authority into the browser.
- Shared request, response, and domain schemas belong in `types/src/`.
- `openapi/openapi.yaml` remains the canonical HTTP contract; keep generated types and contract tests synchronized.
- Use additive migrations in the repository's documented canonical migration directory. Do not rewrite an applied migration.
- Preserve RLS, least-privilege grants, normalized errors, and tenant isolation where applicable.
- Do not claim safe horizontal scaling while rate limits, lockout state, OAuth PKCE state, or fallbacks remain process-local.

## Map the change across boundaries

Touch only the layers the capability genuinely needs:

- Shared schemas and types.
- Express routes, controllers, services, validation, and authorization.
- OpenAPI operations and generated contract types.
- Frontend routes and API consumption.
- Migrations, RLS policies, grants, or operational queries.
- Unit, integration, contract, migration, and isolation tests.
- Architecture, setup, environment, or operational documentation.

Keep route, schema, implementation, generated output, and tests in one coherent change when they describe the same contract.

If the first tenant-owned schema is introduced, define membership and ownership semantics explicitly, enable RLS on every tenant-owned table, justify service-role bypasses, and add seeded two-tenant behavioral isolation tests. Do not add speculative tenancy machinery before a real domain requires it.

## Control scope and reversibility

Prefer narrow interfaces, configuration, adapters, and additive migrations over hardcoded providers or irreversible coupling. Separate independent infrastructure, observability, billing, and product primitives into later changes unless required for the requested capability.

Record an ADR under `docs/decisions/` when a decision crosses packages, changes a trust or data boundary, selects a durable provider, or would be costly to reverse. Capture context, options, decision, consequences, and revisit conditions. Routine implementation choices do not need an ADR.

When requirements are incomplete, preserve a replaceable seam and document the deferred choice instead of inventing product behavior.

## Verify and hand off

Run checks proportional to the affected boundaries, including contract drift, type checks, tests, builds, and migration and RLS validation where relevant. Update maintained documentation when behavior or operational assumptions change.

Report the decision, assumptions, affected boundaries, verification performed, and intentionally deferred work. Do not describe the system as multi-tenant, horizontally scalable, or production-ready beyond what the code and tests demonstrate.
