# 0002: Stripe as the default billing provider

Status: accepted

## Context and constraints

The starter needs a provider for charging the SaaS operator's customers. It has no product, price, tenant-owned domain, or entitlement model yet. The initial market is Nordic, with Railway and VM deployment targets. The integration must keep payment credentials out of the browser, accept provider webhooks safely, and remain replaceable until the product's geography and payment-method mix are known.

## Options considered

- Stripe Billing: hosted Checkout and customer portal, subscription lifecycle automation, configurable recurring prices, broad international support, and a mature Node SDK.
- Paytrail: especially strong Finnish consumer payment coverage and domestic support. Recurring billing is based on stored-card tokenization and merchant-triggered charges, and enabling tokenization involves a provider sales flow.
- A provider-neutral implementation before selecting either provider: reduces visible coupling but cannot remove provider-specific webhook, checkout, customer, and subscription semantics. It would add abstraction without a second proven implementation.

## Decision

Use Stripe Billing for the generic starter. Express creates Stripe-hosted Checkout and customer-portal sessions, validates an allowlist of recurring Stripe Price IDs, verifies signed webhooks from the raw request body, and stores only billing projections and event-processing metadata in Supabase. The browser never receives the Stripe secret key and never writes billing state directly.

Billing remains disabled until explicitly configured. Product names, descriptions, currency, cadence, and amounts come from allowlisted Stripe Prices and Products; the repository does not invent plans or pricing. Billing records belong to Supabase users because no substantive tenant model exists yet. They are not product entitlements.

## Security and operational consequences

- Stripe is the source of truth; Supabase stores a queryable projection used by the application.
- Webhook event IDs are durable idempotency keys. Raw webhook payloads are not retained, reducing unnecessary payment/customer data storage.
- Provider failures return normalized service errors and do not mutate browser-managed auth state.
- Replay and reconciliation are admin-only, auditable operations. Reconciliation is deliberately scoped to one user per request.
- Checkout supports one allowlisted recurring price per subscription. Multi-item, usage-based, tax, coupons, seat quantities, trials, and entitlement enforcement are deferred until product requirements exist.

## Revisit conditions

Reconsider Paytrail or add a second adapter if the product becomes Finland-first and conversion depends materially on Finnish bank/mobile methods, or if commercial terms favour Paytrail. Revisit the user-owned model when real organisation membership and tenant billing ownership are defined. Revisit the single-price constraint when a real product needs seats, add-ons, metering, or hybrid pricing.
