import type {
  StripeCheckoutTestData,
  StripeWebhookReceiptData,
} from "@supabase-modular-auth/types";

import { Stripe } from "stripe";

import config from "../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../utils/errors.js";

export interface StripeServiceOptions {
  enabled: boolean;
  priceId?: string;
  secretKey?: string;
  stripe: Stripe | null;
  webhookSecret?: string;
}

export class StripeService {
  private readonly enabled: boolean;
  private readonly priceId?: string;
  private readonly stripe: Stripe | null;
  private readonly webhookSecret?: string;

  constructor(options: Partial<StripeServiceOptions> = {}) {
    this.enabled = options.enabled ?? config.STRIPE_SMOKE_TEST_ENABLED;
    this.priceId = options.priceId ?? config.STRIPE_TEST_PRICE_ID;
    this.webhookSecret = options.webhookSecret ?? config.STRIPE_WEBHOOK_SECRET;

    const secretKey = options.secretKey ?? config.STRIPE_SECRET_KEY;
    this.stripe =
      options.stripe === undefined
        ? this.enabled && secretKey
          ? new Stripe(secretKey, {
              maxNetworkRetries: 1,
              timeout: Math.min(config.REQUEST_TIMEOUT_MS, 10_000),
            })
          : null
        : options.stripe;
  }

  public async createCheckoutTest(user: { id: string }): Promise<StripeCheckoutTestData> {
    const stripe = this.requireStripe();
    const priceId = this.priceId;
    if (!priceId) {
      throw new ServiceUnavailableError("Stripe Checkout smoke test is not configured");
    }

    const returnUrl = new URL("/billing/test", config.FRONTEND_URL);
    const successUrl = new URL(returnUrl);
    successUrl.searchParams.set("checkout", "returned");
    const cancelUrl = new URL(returnUrl);
    cancelUrl.searchParams.set("checkout", "cancelled");

    try {
      const session = await stripe.checkout.sessions.create({
        cancel_url: cancelUrl.toString(),
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          purpose: "integration_smoke_test",
          supabase_user_id: user.id,
        },
        mode: "payment",
        success_url: successUrl.toString(),
      });

      if (!session.url) {
        throw new ServiceUnavailableError("Stripe Checkout did not return a redirect URL");
      }

      return { url: session.url };
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Stripe Checkout is temporarily unavailable");
    }
  }

  public verifyWebhook(payload: Buffer, signature: string): StripeWebhookReceiptData {
    const stripe = this.requireStripe();
    const webhookSecret = this.webhookSecret;
    if (!webhookSecret) {
      throw new ServiceUnavailableError("Stripe webhook verification is not configured");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new ValidationError("Invalid Stripe webhook signature");
    }

    const checkoutCompleted = event.type === "checkout.session.completed";
    const checkoutSession = checkoutCompleted ? event.data.object : null;

    return {
      checkoutCompleted,
      eventId: event.id,
      eventType: event.type,
      paymentStatus:
        checkoutSession?.object === "checkout.session" ? checkoutSession.payment_status : null,
    };
  }

  private requireStripe(): Stripe {
    if (!this.enabled || !this.stripe) {
      throw new ServiceUnavailableError("Stripe Checkout smoke test is not configured");
    }

    return this.stripe;
  }
}

const stripeService = new StripeService();
export default stripeService;
