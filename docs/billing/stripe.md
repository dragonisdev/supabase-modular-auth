# Stripe Checkout

This repository includes a small Stripe foundation: an authenticated endpoint creates a
Stripe-hosted Checkout Session for one server-configured Price. It does not yet store billing state
or grant product access.

## Configure Checkout

Create a Product and Price in Stripe, then add these backend-only values to the ignored
`backend/.env` file:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
```

The Price defines the billing model. A recurring Price creates a subscription Checkout Session; a
one-time Price creates a payment Checkout Session. The browser never receives the secret key or
chooses a Price ID.

Restart the app with `pnpm dev`, sign in with a verified account, and open
`http://localhost:3001/billing`. Selecting **Continue to Checkout** proves that the backend can read
the configured Price and create a hosted Checkout Session. In Stripe test mode, use card
`4242 4242 4242 4242`, any future expiry, and any CVC.

The Stripe Dashboard records the resulting Session and test payment. The browser return only proves
navigation back to the app; it is not fulfillment. Test and live Stripe keys use the same
application code, so deployment only changes the secret key and Price ID in the secret store.

## Extending billing later

Once the product's billing and ownership model is known, add signed webhook handling with durable
idempotency, billing-state persistence, reconciliation, and entitlement fulfillment. Never grant
access from the Checkout return URL. This initial integration requires no Supabase migration.

See Stripe's documentation for the [hosted Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works?payment-ui=stripe-hosted)
and [test values](https://docs.stripe.com/testing).
