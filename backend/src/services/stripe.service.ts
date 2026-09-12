import type { StripeCheckoutData } from "@supabase-modular-auth/types";

import { Stripe } from "stripe";

import config from "../config/env.js";
import { ServiceUnavailableError } from "../utils/errors.js";

export interface StripeServiceOptions {
  priceId?: string;
  secretKey?: string;
  stripe: Stripe | null;
}

export class StripeService {
  private readonly priceId?: string;
  private readonly stripe: Stripe | null;

  constructor(options: Partial<StripeServiceOptions> = {}) {
    this.priceId = options.priceId ?? config.STRIPE_PRICE_ID;

    const secretKey = options.secretKey ?? config.STRIPE_SECRET_KEY;
    this.stripe =
      options.stripe === undefined
        ? secretKey
          ? new Stripe(secretKey, {
              maxNetworkRetries: 1,
              timeout: Math.min(config.REQUEST_TIMEOUT_MS, 10_000),
            })
          : null
        : options.stripe;
  }

  public async createCheckout(user: { id: string }): Promise<StripeCheckoutData> {
    const stripe = this.requireStripe();
    const priceId = this.priceId;
    if (!priceId) {
      throw new ServiceUnavailableError("Stripe Checkout is not configured");
    }

    const returnUrl = new URL("/billing", config.FRONTEND_URL);
    const successUrl = new URL(returnUrl);
    successUrl.searchParams.set("checkout", "returned");
    const cancelUrl = new URL(returnUrl);
    cancelUrl.searchParams.set("checkout", "cancelled");

    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active) {
        throw new ServiceUnavailableError("The configured Stripe Price is inactive");
      }

      const session = await stripe.checkout.sessions.create({
        cancel_url: cancelUrl.toString(),
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          supabase_user_id: user.id,
        },
        mode: price.recurring ? "subscription" : "payment",
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

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableError("Stripe Checkout is not configured");
    }

    return this.stripe;
  }
}

const stripeService = new StripeService();
export default stripeService;
