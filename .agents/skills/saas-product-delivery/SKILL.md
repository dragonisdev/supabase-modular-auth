---
name: saas-product-delivery
description: >-
  Turn an approved SaaS outcome into the smallest measurable end-to-end vertical
  slice, including value evidence, operability, rollout, and reconciliation. Use
  after product direction is decided; do not use for open-ended product
  discovery, speculative platform primitives, or unapproved production rollout.
---

# SaaS Product Delivery

Deliver one useful, measurable SaaS outcome without expanding it into a generic platform project.

## Entry gate

Before implementation, identify:

- The approved user or customer outcome.
- The target user and behavior being improved.
- The relevant product, architecture, security, and authorization constraints.
- The evidence that would justify continuing, changing, or stopping.

If a missing product decision would materially change the data model, pricing, tenancy, workflow, or integration, surface that decision instead of inventing durable primitives.

## Shape the vertical slice

Choose the smallest slice that lets a real user complete the intended journey and produces meaningful evidence.

Include only the layers required for that journey, such as UI, API, data, authorization, and operational support. Avoid orphan schemas, generic service abstractions, speculative integrations, and reusable infrastructure without an immediate consumer.

State explicit non-goals so adjacent ideas do not silently enter scope.

## Define evidence before building

Pair functional acceptance criteria with a small evidence plan. Choose measures relevant to the approved outcome:

- Customer value: completion, activation, retention signal, reduced errors, or time saved.
- Commercial value: paid conversion, revenue, willingness-to-pay evidence, or another clearly labelled proxy.
- Delivery productivity: implementation lead time, operational effort, support burden, or manual steps removed.
- Cost: incremental infrastructure, provider, support, and reconciliation costs.

Do not present engagement or a proxy metric as profitability. When pricing or revenue is undecided, label assumptions and measure the nearest honest validation signal. Collect only data necessary for the decision and consistent with privacy and security requirements.

## Implement end to end

Preserve existing repository boundaries and approved product decisions.

- Reuse established contracts, authorization, tenancy, and error-handling patterns.
- Keep security-sensitive and privileged operations on trusted server boundaries.
- Make state transitions explicit and test the user-visible outcome, not merely isolated scaffolding.
- Prefer reversible schema and API changes.
- Add complexity only when the slice demonstrates the need for it.

## Operability and reconciliation

For state-changing or externally integrated flows, define:

- The source of truth.
- Idempotency and duplicate handling.
- Retry limits and terminal failure behavior.
- Observable success and failure signals.
- Replay or repair procedures.
- Reconciliation between internal and external state.
- Rollback or disablement behavior.

Use feature flags, staged rollout, or compatibility periods only when the change's risk justifies them. Do not call a flow complete when failures require undocumented database edits or provider-console intervention.

## Verify and hand off

Verify the slice at the highest practical level, including relevant contracts, authorization boundaries, failure behavior, and reconciliation paths.

Report:

- The shipped outcome and slice boundary.
- Functional acceptance results.
- Available value, productivity, and cost evidence.
- Rollout, rollback, and reconciliation procedures.
- Known limitations and the next decision the evidence should inform.

Stop after the approved slice. Treat additional primitives and integrations as separate decisions.

## Authorization boundaries

Authorization to design or implement code does not authorize:

- Deploying to production.
- Applying live database migrations.
- Enabling billing or charging customers.
- Creating external accounts or resources.
- Sending customer communications.
- Mutating production data.

Before an external or difficult-to-reverse action, confirm that it is explicitly authorized. If an operation's outcome is ambiguous, do not retry blindly; inspect state and reconcile first.
