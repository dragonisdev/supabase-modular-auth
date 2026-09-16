# 0002: Stripe billing and credit entitlements

Status: accepted

Date: 2026-09-16

Implementation: deferred. The current Stripe foundation creates hosted Checkout Sessions but does
not yet persist billing state or grant credits.

## Context and constraints

The starter needs one end-to-end billing flow that can be exercised with Stripe test mode without
committing the product to recurring subscriptions, usage metering, or a tenant model. The browser
must not decide what a payment grants, and returning from Stripe Checkout is not proof that payment
succeeded.

Supabase Auth remains the identity source. Billing must not depend on an application profile row,
because profile data has a different lifecycle and will be introduced separately. Stripe remains
the source of truth for payment state, while Supabase stores the minimum application projection
needed to grant and audit product entitlements.

## Options considered

- Store a paid flag or credit balance on a future profile row: simple, but couples user-editable
  profile data to security-sensitive billing state and provides no immutable history.
- Store only a mutable credit balance: compact, but duplicate webhook deliveries, concurrent usage,
  and reconciliation are difficult to audit safely.
- Start with recurring subscriptions: demonstrates more Stripe functionality, but requires renewal,
  cancellation, failed-payment, portal, and reconciliation behavior before the product has selected
  a subscription entitlement.
- Use a billing account plus an append-only credit ledger: keeps customer identity separate from
  individual entitlement changes and permits subscriptions to be added without replacing one-time
  purchases.

## Decision

Use Stripe-hosted Checkout with one server-configured, one-time Price. A successful paid Checkout
grants 20 non-expiring credits.

Express is the billing security boundary. It creates Checkout Sessions, verifies Stripe webhook
signatures against the unmodified request body, validates the configured Price and paid status, and
performs privileged Supabase writes. The frontend never receives Stripe secret credentials, chooses
the credit grant, or writes billing tables directly. The browser return URL is presentation only;
verified webhook fulfillment is the source of truth.

Persist the local billing projection in two public-schema tables protected by RLS and explicit
least-privilege grants:

- `billing_accounts` stores the one-to-one association between `auth.users` and a Stripe Customer.
  It references `auth.users` directly and does not depend on `profiles`.
- `billing_credit_ledger` stores immutable credit deltas and the provider identifiers needed for
  audit and idempotency. Purchases add positive entries; future product usage adds negative entries;
  reversals use compensating entries rather than edits or deletes.

Do not persist a derived credit-balance column initially. Calculate the current balance as the sum
of ledger deltas for the user, supported by an index on `user_id`. Unique Stripe event and Checkout
Session identifiers prevent retries or duplicate deliveries from granting credits twice.

Credit consumption is intentionally deferred until a concrete product operation exists. That
operation must determine its server-side cost and atomically verify the available balance and add a
negative ledger entry with a unique product-operation reference. No generic client-controlled
credit-consumption endpoint will be introduced.

Subscriptions are an additive extension rather than a replacement. A future
`billing_subscriptions` projection can reuse the billing account, Checkout boundary, webhook
verification, and idempotency machinery. A subscription may either authorize access directly or
grant recurring credits by adding ledger entries after successful invoices.

## Security and operational consequences

- Card and payment-method details remain in Stripe and are never stored by the application.
- Anonymous and authenticated database roles cannot write billing state. Backend-only privileged
  operations are required for fulfillment and later credit consumption.
- Fulfillment must commit its local state atomically and return a retryable failure when persistence
  fails. Stripe retries must remain safe through database uniqueness constraints.
- Payment amount, currency, Price, Checkout Session, PaymentIntent, and event identifiers may be
  stored as an audit projection; Stripe remains authoritative for the underlying payment.
- The initial test-mode slice does not automate refunds, disputes, chargebacks, subscription
  lifecycle, credit expiration, or credit consumption. It must not be presented as complete live
  billing until the applicable operational paths are implemented.
- User-facing profile and account settings can be added independently in a later change. Billing
  authorization must not rely on editable profile fields or user metadata.

## Revisit conditions

Revisit this decision when the product defines what consumes credits, needs expiring or promotional
credits, offers multiple credit packs, begins accepting live payments, or selects a subscription
entitlement. Add refund and dispute reconciliation before treating credits purchased with live
payments as production-complete. Consider a transactionally maintained balance projection only when
measured ledger-query volume justifies the additional consistency machinery.
