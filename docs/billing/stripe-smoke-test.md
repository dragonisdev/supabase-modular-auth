# Stripe Checkout smoke test

This optional test harness proves that the application can create a Stripe-hosted Checkout Session,
accept a sandbox payment, and verify Stripe's signed completion webhook. It is deliberately not a
billing model: it creates no customer, subscription, credit balance, plan, entitlement, or Supabase
record.

When this harness is enabled, the backend requires an `sk_test_...` Stripe secret key. Live keys
cannot enable this flow.

## Configure a Stripe sandbox

1. In a Stripe sandbox, create one Product with a one-time Price. Copy its `price_...` identifier.
2. Install and authenticate the Stripe CLI.
3. Forward only Checkout completion events through the public Next.js proxy:

   ```bash
   stripe listen --events checkout.session.completed --forward-to http://localhost:3001/api/billing/webhook
   ```

4. Copy the `whsec_...` secret printed by that command. A Stripe CLI endpoint secret is different
   from a Dashboard-managed webhook endpoint secret.
5. Add the following to the ignored `backend/.env` file:

   ```env
   STRIPE_SMOKE_TEST_ENABLED=true
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_TEST_PRICE_ID=price_...
   STRIPE_WEBHOOK_MAX_SIZE=256kb
   ```

Restart the backend after changing environment variables. No Supabase migration is needed.

## Exercise the flow

1. Start the application with `pnpm dev` and sign in with a verified account.
2. Open `http://localhost:3001/billing/test`.
3. Select **Start test payment**. The backend creates a `mode=payment` Checkout Session and returns
   only Stripe's hosted URL to the browser.
4. Complete Checkout with Stripe's successful test card `4242 4242 4242 4242`, any future expiry,
   and any CVC.
5. Confirm both signals:
   - the browser returns to the test page; and
   - the backend emits `SECURITY_STRIPE_WEBHOOK_VERIFIED` with
     `eventType=checkout.session.completed` and `paymentStatus=paid`.

The browser redirect is only a navigation signal. The signed webhook proves that Stripe reported
the completed Checkout Session. This harness logs that fact but performs no fulfillment.

## Deployment and deferred production work

For a shared preview environment, configure a Stripe sandbox and create a Dashboard webhook at:

```text
https://app.example.com/api/billing/webhook
```

Subscribe it to `checkout.session.completed` and use that endpoint's own signing secret. Keep every
Stripe credential in the backend secret store; the frontend requires no publishable key because it
redirects to the server-created hosted URL.

Before real billing is implemented, choose the product's ownership and commercial model. That later
change must add durable, idempotent webhook processing and fulfillment appropriate to subscriptions,
credits, usage, or one-time purchases. Do not grant access from the return-page query string or from
this smoke-test log.

Stripe documents the [hosted Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted),
[webhook signature requirements](https://docs.stripe.com/webhooks/signature), and
[sandbox test values](https://docs.stripe.com/testing).
