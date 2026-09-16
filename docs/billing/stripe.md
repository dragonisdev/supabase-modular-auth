# Stripe Checkout and credit fulfillment

This repository includes one complete Stripe test-mode billing slice. An authenticated user buys
the single server-configured one-time Price through Stripe-hosted Checkout. A verified Stripe
webhook then records the payment and grants 20 non-expiring credits in Supabase.

The browser return is informational only. It never grants credits.

## Configure Stripe

Create a Stripe Product with an active **one-time** Price, then add these backend-only values to the
ignored `backend/.env` file:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CREDITS_PER_PURCHASE=20
```

All three Stripe secrets/settings must be present together. The browser never receives the secret
key, webhook secret, Price ID, or authority to choose the credit grant.

Apply the billing migration to the intended Supabase project after reviewing the dry run:

```bash
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

For local webhook testing, install and authenticate the Stripe CLI, then run:

```bash
stripe listen --forward-to http://localhost:3000/billing/webhook
```

Copy the displayed `whsec_...` signing secret into `backend/.env` and restart `pnpm dev`. Sign in
with a verified account, open `http://localhost:3001/billing`, and select **Buy 20 credits**. In
Stripe test mode, use card `4242 4242 4242 4242`, any future expiry, and any CVC.

After Checkout returns, refresh the billing page if necessary. Webhook delivery is asynchronous, so
the signed webhook may update the balance just after the browser returns.

## Fulfillment and storage

The flow is deliberately production-shaped even though it is intended for test-mode validation:

1. `POST /billing/checkout` authenticates the user, validates the configured Price is active and
   one-time, creates or reuses the user's Stripe Customer, and creates a card Checkout Session.
2. Stripe posts `checkout.session.completed` to `POST /billing/webhook`.
3. Express verifies `Stripe-Signature` against the untouched raw request body, retrieves the Session
   from Stripe again, and validates paid status, user ownership, Price, quantity, and provider IDs.
4. One Supabase RPC transaction associates the Customer and appends a `+20` ledger entry. Unique
   Stripe event and Checkout Session IDs make duplicate webhook deliveries safe.
5. `GET /billing` derives the current balance from the append-only ledger for the authenticated
   user. Browser roles have no direct privileges on either billing table.

`billing_accounts` maps `auth.users` to Stripe Customers. `billing_credit_ledger` stores immutable
credit deltas and the Stripe audit identifiers. The application does not store card details and
does not maintain a second mutable balance column.

## Scope and future production work

This slice validates Checkout, signed fulfillment, persistence, and a visible credit balance. It
does not yet consume credits because there is no concrete product operation to charge. It also does
not automate refunds, disputes, chargebacks, tax, or subscription lifecycle. Add those operational
paths before using live payments.

Subscriptions can be added later without replacing the customer mapping, webhook boundary, or
ledger. The accepted design and revisit conditions are recorded in
[ADR 0002](../decisions/0002-stripe-billing-and-credit-entitlements.md).

See Stripe's documentation for the
[hosted Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted),
[webhook signatures](https://docs.stripe.com/webhooks/signature), and
[test values](https://docs.stripe.com/testing).
