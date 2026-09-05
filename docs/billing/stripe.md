# Stripe billing

Stripe is the selected default for this generic SaaS starter. The decision and Paytrail comparison are recorded in [ADR 0002](../decisions/0002-stripe-billing-provider.md).

## Scope

The integration provides:

- A backend-driven catalog from allowlisted recurring Stripe Prices
- Stripe-hosted subscription Checkout
- Stripe-hosted customer portal sessions
- Signed webhook ingestion and durable idempotency metadata
- User subscription projections in Supabase
- Admin-only replay of a Stripe event and reconciliation of one user
- A thin `/billing` frontend route

It deliberately does not define product entitlements, tenant billing ownership, trials, tax policy, coupons, seat counts, usage metering, or multi-item subscriptions. Stripe remains the billing source of truth; Supabase stores an application projection.

Checkout is available only when Stripe reports no non-terminal subscription for the mapped customer. Existing subscribers must use the hosted customer portal, which avoids creating parallel subscriptions through the starter UI or API.

## Configure Stripe

1. Create products and fixed recurring prices in Stripe. Product name and description plus price currency, amount, and cadence are displayed by the frontend.
2. Configure the Stripe customer portal in the Dashboard.
3. Add a webhook endpoint for the public same-origin proxy URL:

   ```text
   https://app.example.com/api/billing/webhook
   ```

4. Subscribe to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

5. Apply the Supabase migrations, then configure the backend:

   ```env
   BILLING_ENABLED=true
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_IDS=price_monthly,price_yearly
   STRIPE_WEBHOOK_MAX_SIZE=256kb
   ```

Production and test modes must not be mixed. Use a Stripe test secret, test prices, and the endpoint secret generated for the test webhook during development.

Stripe documents [subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions), [webhook signatures](https://docs.stripe.com/webhooks/signature), and the [customer portal](https://docs.stripe.com/customer-management).

## Local webhook testing

Run the application and use the Stripe CLI to forward signed events through the Next.js proxy:

```bash
stripe listen \
  --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted \
  --forward-to http://localhost:3001/api/billing/webhook
```

Put the displayed `whsec_...` value in `backend/.env`, restart the backend, and use Stripe test-mode Checkout. The repository never stores raw webhook payloads.

## Replay and reconciliation

Both tools require an authenticated admin session and the normal CSRF cookie/header pair:

- `POST /api/admin/billing/webhooks/:eventId/replay` retrieves the immutable event from Stripe and applies its projection again.
- `POST /api/admin/billing/reconcile` with `{ "userId": "<supabase-user-uuid>" }` lists that customer's Stripe subscriptions and upserts the local projection.

The `/admin/billing` page exposes these two bounded operations without placing provider credentials in the browser.

Each operation writes an admin audit record. Reconciliation is intentionally one user per request and refuses customers with more than 100 subscriptions, before changing the local projection, so it remains bounded and observable. A future scheduled/batch reconciler should page through local customers and provider subscriptions, checkpoint progress, enforce concurrency limits, and emit metrics rather than calling this endpoint in an unbounded loop.

## Failure and data handling

- Invalid signatures return `400` and are never processed.
- Provider or persistence failures return `503`, causing Stripe to retry webhooks.
- Duplicate processed event IDs are acknowledged without reapplying unless an admin explicitly replays one.
- Stripe secret keys and webhook secrets are backend-only secrets.
- Customer card data never enters this application; Checkout and the customer portal are Stripe-hosted.
