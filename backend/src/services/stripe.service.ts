import type {
  BillingOverviewData,
  StripeCheckoutData,
  StripeWebhookData,
} from "@supabase-modular-auth/types";

import { Stripe } from "stripe";

import config from "../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../utils/errors.js";
import { type BillingStore, SupabaseBillingStore } from "./billing-store.service.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StripeServiceOptions {
  creditsPerPurchase: number;
  priceId?: string;
  secretKey?: string;
  store: BillingStore;
  stripe: Stripe | null;
  webhookSecret?: string;
}

const getResourceId = (resource: { id: string } | string | null): string | null =>
  typeof resource === "string" ? resource : (resource?.id ?? null);

export class StripeService {
  private readonly creditsPerPurchase: number;
  private readonly priceId?: string;
  private readonly store: BillingStore;
  private readonly stripe: Stripe | null;
  private readonly webhookSecret?: string;

  constructor(options: Partial<StripeServiceOptions> = {}) {
    this.creditsPerPurchase = options.creditsPerPurchase ?? config.STRIPE_CREDITS_PER_PURCHASE;
    this.priceId = options.priceId ?? config.STRIPE_PRICE_ID;
    this.store = options.store ?? new SupabaseBillingStore();
    this.webhookSecret = options.webhookSecret ?? config.STRIPE_WEBHOOK_SECRET;

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

  public async getOverview(userId: string): Promise<BillingOverviewData> {
    return {
      credits: await this.store.getBalance(userId),
      creditsPerPurchase: this.creditsPerPurchase,
    };
  }

  public async createCheckout(user: { email?: string; id: string }): Promise<StripeCheckoutData> {
    const stripe = this.requireStripe();
    const priceId = this.requirePriceId();

    const returnUrl = new URL("/billing", config.FRONTEND_URL);
    const successUrl = new URL(returnUrl);
    successUrl.searchParams.set("checkout", "returned");
    const cancelUrl = new URL(returnUrl);
    cancelUrl.searchParams.set("checkout", "cancelled");

    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active || price.recurring || price.unit_amount === null) {
        throw new ValidationError("The configured Stripe Price must be an active one-time Price");
      }

      const customerId = await this.getOrCreateCustomer(user);
      const session = await stripe.checkout.sessions.create({
        cancel_url: cancelUrl.toString(),
        client_reference_id: user.id,
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { supabase_user_id: user.id },
        mode: "payment",
        payment_method_types: ["card"],
        success_url: successUrl.toString(),
      });

      if (!session.url) {
        throw new ServiceUnavailableError("Stripe Checkout did not return a redirect URL");
      }

      return { url: session.url };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Stripe Checkout is temporarily unavailable");
    }
  }

  public async handleWebhook(payload: Buffer, signature: string): Promise<StripeWebhookData> {
    const stripe = this.requireStripe();
    if (!this.webhookSecret) {
      throw new ServiceUnavailableError("Stripe webhook processing is not configured");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch {
      throw new ValidationError("Invalid Stripe webhook signature");
    }

    if (event.type !== "checkout.session.completed") {
      return {
        balance: null,
        creditsGranted: 0,
        eventId: event.id,
        eventType: event.type,
        processed: false,
      };
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, {
        expand: ["line_items.data.price"],
      });
      const userId = session.metadata?.supabase_user_id;
      const lineItem = session.line_items?.data[0];
      const sessionPriceId = lineItem?.price?.id;
      const customerId = getResourceId(session.customer);
      const paymentIntentId = getResourceId(session.payment_intent);

      if (
        session.mode !== "payment" ||
        session.payment_status !== "paid" ||
        !userId ||
        !UUID_PATTERN.test(userId) ||
        session.client_reference_id !== userId ||
        sessionPriceId !== this.requirePriceId() ||
        session.line_items?.data.length !== 1 ||
        lineItem?.quantity !== 1 ||
        session.amount_total === null ||
        !session.currency ||
        !customerId ||
        !paymentIntentId
      ) {
        throw new ValidationError("Stripe Checkout fulfillment data is inconsistent");
      }

      const result = await this.store.fulfillCreditPurchase({
        amountTotal: session.amount_total,
        credits: this.creditsPerPurchase,
        currency: session.currency,
        eventId: event.id,
        paymentIntentId,
        priceId: sessionPriceId,
        sessionId: session.id,
        stripeCustomerId: customerId,
        userId,
      });

      return {
        balance: result.balance,
        creditsGranted: result.applied ? this.creditsPerPurchase : 0,
        eventId: event.id,
        eventType: event.type,
        processed: result.applied,
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Stripe webhook processing failed");
    }
  }

  private async getOrCreateCustomer(user: { email?: string; id: string }): Promise<string> {
    const existingCustomerId = await this.store.getCustomerId(user.id);
    if (existingCustomerId) {
      return existingCustomerId;
    }

    const customer = await this.requireStripe().customers.create(
      {
        ...(user.email ? { email: user.email } : {}),
        metadata: { supabase_user_id: user.id },
      },
      { idempotencyKey: `customer:${user.id}` },
    );

    return this.store.createAccount(user.id, customer.id);
  }

  private requirePriceId(): string {
    if (!this.priceId) {
      throw new ServiceUnavailableError("Stripe Checkout is not configured");
    }
    return this.priceId;
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
