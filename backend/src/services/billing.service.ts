import type {
  BillingOverviewData,
  BillingPlan,
  BillingReconcileResult,
  BillingSubscription,
  BillingWebhookReplayResult,
} from "@supabase-modular-auth/types";

import { Stripe } from "stripe";

import config from "../config/env.js";
import { ServiceUnavailableError, ValidationError } from "../utils/errors.js";
import SupabaseService from "./supabase.service.js";

const BILLING_CUSTOMERS_TABLE = "billing_customers";
const BILLING_SUBSCRIPTIONS_TABLE = "billing_subscriptions";
const BILLING_WEBHOOK_EVENTS_TABLE = "billing_webhook_events";

interface BillingCustomerRow {
  provider_customer_id: string;
  user_id: string;
}

interface BillingSubscriptionRow {
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  current_period_start: string | null;
  price_id: string | null;
  provider_subscription_id: string;
  status: BillingSubscription["status"];
}

interface BillingWebhookEventRow {
  attempts: number;
  status: "failed" | "processed" | "processing";
}

export interface BillingServiceOptions {
  enabled: boolean;
  frontendUrl: string;
  priceIds: readonly string[];
  stripe: Stripe | null;
  webhookSecret?: string;
}

const toIsoDate = (unixSeconds: number | null | undefined): string | null =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000).toISOString() : null;

const getStripeId = (resource: { id: string } | string): string =>
  typeof resource === "string" ? resource : resource.id;

const getSafeErrorCode = (error: unknown): string => {
  if (error instanceof Stripe.errors.StripeError) {
    return error.type;
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "UNKNOWN_ERROR";
};

const isBillingInterval = (value: string): value is BillingPlan["interval"] =>
  ["day", "week", "month", "year"].includes(value);

export class BillingService {
  private readonly enabled: boolean;
  private readonly frontendUrl: string;
  private readonly priceIds: readonly string[];
  private readonly stripe: Stripe | null;
  private readonly webhookSecret?: string;

  constructor(options: Partial<BillingServiceOptions> = {}) {
    this.enabled = options.enabled ?? config.BILLING_ENABLED;
    this.frontendUrl = options.frontendUrl ?? config.FRONTEND_URL;
    this.priceIds = options.priceIds ?? config.STRIPE_PRICE_IDS;
    this.stripe =
      options.stripe === undefined
        ? this.enabled
          ? new Stripe(config.STRIPE_SECRET_KEY as string)
          : null
        : options.stripe;
    this.webhookSecret = options.webhookSecret ?? config.STRIPE_WEBHOOK_SECRET;
  }

  public async getOverview(userId: string): Promise<BillingOverviewData> {
    if (!this.enabled) {
      return { enabled: false, plans: [], subscriptions: [] };
    }

    const [plans, subscriptions] = await Promise.all([
      this.getPlans(),
      this.getSubscriptions(userId),
    ]);

    return { enabled: true, plans, subscriptions };
  }

  public async createCheckoutSession(
    user: { email?: string; id: string },
    priceId: string,
  ): Promise<string> {
    const stripe = this.requireStripe();
    this.assertAllowedPrice(priceId);

    try {
      const price = await stripe.prices.retrieve(priceId);
      if (!price.active || !price.recurring || price.unit_amount === null) {
        throw new ValidationError("The selected billing plan is unavailable");
      }

      const customerId = await this.getOrCreateCustomer(user);
      await this.assertNoExistingSubscription(customerId);
      const returnUrl = new URL("/billing", this.frontendUrl);
      const successUrl = new URL(returnUrl);
      successUrl.searchParams.set("checkout", "success");

      const session = await stripe.checkout.sessions.create(
        {
          billing_address_collection: "auto",
          cancel_url: returnUrl.toString(),
          client_reference_id: user.id,
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: { supabase_user_id: user.id },
          mode: "subscription",
          subscription_data: { metadata: { supabase_user_id: user.id } },
          success_url: successUrl.toString(),
        },
        {
          idempotencyKey: `checkout:${user.id}:${priceId}:${Math.floor(Date.now() / 60_000)}`,
        },
      );

      if (!session.url) {
        throw new ServiceUnavailableError("Billing checkout is temporarily unavailable");
      }

      return session.url;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing checkout is temporarily unavailable");
    }
  }

  public async createPortalSession(userId: string): Promise<string> {
    const stripe = this.requireStripe();
    const customer = await this.getCustomerByUserId(userId);
    if (!customer) {
      throw new ValidationError("No billing account exists for this user");
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customer.provider_customer_id,
        return_url: new URL("/billing", this.frontendUrl).toString(),
      });
      return session.url;
    } catch {
      throw new ServiceUnavailableError("Billing management is temporarily unavailable");
    }
  }

  public async handleWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<BillingWebhookReplayResult> {
    const stripe = this.requireStripe();
    const webhookSecret = this.webhookSecret;
    if (!webhookSecret) {
      throw new ServiceUnavailableError("Billing webhook processing is not configured");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new ValidationError("Invalid billing webhook signature");
    }

    return this.processTrackedEvent(event, false);
  }

  public async replayWebhook(eventId: string): Promise<BillingWebhookReplayResult> {
    const stripe = this.requireStripe();

    try {
      const event = await stripe.events.retrieve(eventId);
      return await this.processTrackedEvent(event, true);
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing webhook replay failed");
    }
  }

  public async reconcileUser(userId: string): Promise<BillingReconcileResult> {
    const stripe = this.requireStripe();
    const customer = await this.getCustomerByUserId(userId);
    if (!customer) {
      return { customerFound: false, subscriptionsSynchronized: 0, userId };
    }

    let synchronized = 0;
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.provider_customer_id,
        limit: 100,
        status: "all",
      });
      if (subscriptions.has_more) {
        throw new ServiceUnavailableError(
          "Billing reconciliation exceeds the single-request safety limit",
        );
      }

      await subscriptions.data.reduce(async (previousSync, subscription) => {
        await previousSync;
        await this.syncSubscription(subscription);
      }, Promise.resolve());
      synchronized = subscriptions.data.length;
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing reconciliation failed");
    }

    return { customerFound: true, subscriptionsSynchronized: synchronized, userId };
  }

  private requireStripe(): Stripe {
    if (!this.enabled || !this.stripe) {
      throw new ServiceUnavailableError("Billing is not configured");
    }
    return this.stripe;
  }

  private assertAllowedPrice(priceId: string): void {
    if (!this.priceIds.includes(priceId)) {
      throw new ValidationError("The selected billing plan is unavailable");
    }
  }

  private async getPlans(): Promise<BillingPlan[]> {
    const stripe = this.requireStripe();

    try {
      return await Promise.all(
        this.priceIds.map(async (priceId): Promise<BillingPlan> => {
          const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
          const product = price.product;

          if (
            !price.active ||
            !price.recurring ||
            price.unit_amount === null ||
            typeof product === "string" ||
            product.deleted
          ) {
            throw new ServiceUnavailableError("Billing catalog is temporarily unavailable");
          }

          if (!isBillingInterval(price.recurring.interval)) {
            throw new ServiceUnavailableError("Billing catalog is temporarily unavailable");
          }

          return {
            currency: price.currency,
            description: product.description,
            interval: price.recurring.interval,
            intervalCount: price.recurring.interval_count,
            name: product.name,
            priceId: price.id,
            unitAmount: price.unit_amount,
          };
        }),
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing catalog is temporarily unavailable");
    }
  }

  private async assertNoExistingSubscription(customerId: string): Promise<void> {
    const stripe = this.requireStripe();

    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 100,
        status: "all",
      });
      const hasNonTerminalSubscription = subscriptions.data.some(
        (subscription) =>
          subscription.status !== "canceled" && subscription.status !== "incomplete_expired",
      );

      if (hasNonTerminalSubscription || subscriptions.has_more) {
        throw new ValidationError(
          "An existing subscription must be managed through the billing portal",
        );
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing subscription lookup failed");
    }
  }

  private async getSubscriptions(userId: string): Promise<BillingSubscription[]> {
    const adminClient = SupabaseService.getAdminClient();
    const { data, error } = await adminClient
      .from(BILLING_SUBSCRIPTIONS_TABLE)
      .select(
        "provider_subscription_id,status,price_id,cancel_at_period_end,current_period_start,current_period_end",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new ServiceUnavailableError("Billing status is temporarily unavailable");
    }

    return ((data || []) as BillingSubscriptionRow[]).map((subscription) => ({
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end,
      currentPeriodStart: subscription.current_period_start,
      priceId: subscription.price_id,
      providerSubscriptionId: subscription.provider_subscription_id,
      status: subscription.status,
    }));
  }

  private async getCustomerByUserId(userId: string): Promise<BillingCustomerRow | null> {
    const adminClient = SupabaseService.getAdminClient();
    const { data, error } = await adminClient
      .from(BILLING_CUSTOMERS_TABLE)
      .select("user_id,provider_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableError("Billing account lookup failed");
    }

    return (data as BillingCustomerRow | null) || null;
  }

  private async getCustomerByProviderId(customerId: string): Promise<BillingCustomerRow | null> {
    const adminClient = SupabaseService.getAdminClient();
    const { data, error } = await adminClient
      .from(BILLING_CUSTOMERS_TABLE)
      .select("user_id,provider_customer_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableError("Billing account lookup failed");
    }

    return (data as BillingCustomerRow | null) || null;
  }

  private async getOrCreateCustomer(user: { email?: string; id: string }): Promise<string> {
    const existing = await this.getCustomerByUserId(user.id);
    if (existing) {
      return existing.provider_customer_id;
    }

    const stripe = this.requireStripe();
    try {
      const customer = await stripe.customers.create(
        {
          ...(user.email ? { email: user.email } : {}),
          metadata: { supabase_user_id: user.id },
        },
        { idempotencyKey: `customer:${user.id}` },
      );

      const adminClient = SupabaseService.getAdminClient();
      const { error } = await adminClient.from(BILLING_CUSTOMERS_TABLE).upsert(
        {
          provider: "stripe",
          provider_customer_id: customer.id,
          user_id: user.id,
        },
        { onConflict: "user_id" },
      );

      if (error) {
        throw new ServiceUnavailableError("Billing account persistence failed");
      }

      return customer.id;
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing account creation failed");
    }
  }

  private async processTrackedEvent(
    event: Stripe.Event,
    force: boolean,
  ): Promise<BillingWebhookReplayResult> {
    const existing = await this.beginWebhookAttempt(event, force);
    if (!force && existing?.status === "processed") {
      return { eventId: event.id, eventType: event.type, processed: false };
    }

    try {
      await this.processEvent(event);
      await this.finishWebhookAttempt(event.id, "processed");
      return { eventId: event.id, eventType: event.type, processed: true };
    } catch (error) {
      await this.finishWebhookAttempt(event.id, "failed", getSafeErrorCode(error));
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError("Billing webhook processing failed");
    }
  }

  private async beginWebhookAttempt(
    event: Stripe.Event,
    force: boolean,
  ): Promise<BillingWebhookEventRow | null> {
    const adminClient = SupabaseService.getAdminClient();
    const { data: existingData, error: selectError } = await adminClient
      .from(BILLING_WEBHOOK_EVENTS_TABLE)
      .select("status,attempts")
      .eq("provider_event_id", event.id)
      .maybeSingle();

    if (selectError) {
      throw new ServiceUnavailableError("Billing webhook persistence failed");
    }

    const existing = (existingData as BillingWebhookEventRow | null) || null;
    if (existing) {
      if (force || existing.status !== "processed") {
        const { error } = await adminClient
          .from(BILLING_WEBHOOK_EVENTS_TABLE)
          .update({
            attempts: existing.attempts + 1,
            last_error_code: null,
            status: "processing",
          })
          .eq("provider_event_id", event.id);
        if (error) {
          throw new ServiceUnavailableError("Billing webhook persistence failed");
        }
      }
      return existing;
    }

    const { error } = await adminClient.from(BILLING_WEBHOOK_EVENTS_TABLE).insert({
      event_type: event.type,
      provider_created_at: toIsoDate(event.created),
      provider_event_id: event.id,
      status: "processing",
    });
    if (error) {
      throw new ServiceUnavailableError("Billing webhook persistence failed");
    }

    return null;
  }

  private async finishWebhookAttempt(
    eventId: string,
    status: "failed" | "processed",
    errorCode?: string,
  ): Promise<void> {
    const adminClient = SupabaseService.getAdminClient();
    const { error } = await adminClient
      .from(BILLING_WEBHOOK_EVENTS_TABLE)
      .update({
        last_error_code: errorCode || null,
        processed_at: status === "processed" ? new Date().toISOString() : null,
        status,
      })
      .eq("provider_event_id", eventId);

    if (error) {
      throw new ServiceUnavailableError("Billing webhook persistence failed");
    }
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    if (
      event.type !== "customer.subscription.created" &&
      event.type !== "customer.subscription.updated" &&
      event.type !== "customer.subscription.deleted"
    ) {
      return;
    }

    const object = event.data.object;
    if (object.object !== "subscription") {
      throw new ServiceUnavailableError("Billing webhook payload is inconsistent");
    }

    await this.syncSubscription(object);
  }

  private async syncSubscription(subscription: Stripe.Subscription): Promise<void> {
    const customerId = getStripeId(subscription.customer);
    const existingCustomer = await this.getCustomerByProviderId(customerId);
    const metadataUserId = subscription.metadata.supabase_user_id;

    if (existingCustomer && metadataUserId && existingCustomer.user_id !== metadataUserId) {
      throw new ServiceUnavailableError("Billing customer ownership is inconsistent");
    }

    const userId = existingCustomer?.user_id || metadataUserId;
    if (!userId) {
      throw new ServiceUnavailableError("Billing customer ownership is missing");
    }

    if (!existingCustomer) {
      const adminClient = SupabaseService.getAdminClient();
      const { error } = await adminClient.from(BILLING_CUSTOMERS_TABLE).upsert(
        {
          provider: "stripe",
          provider_customer_id: customerId,
          user_id: userId,
        },
        { onConflict: "user_id" },
      );
      if (error) {
        throw new ServiceUnavailableError("Billing customer synchronization failed");
      }
    }

    const item = subscription.items.data[0];
    const adminClient = SupabaseService.getAdminClient();
    const { error } = await adminClient.from(BILLING_SUBSCRIPTIONS_TABLE).upsert(
      {
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: toIsoDate(item?.current_period_end),
        current_period_start: toIsoDate(item?.current_period_start),
        price_id: item?.price.id || null,
        provider_customer_id: customerId,
        provider_subscription_id: subscription.id,
        status: subscription.status,
        user_id: userId,
      },
      { onConflict: "provider_subscription_id" },
    );

    if (error) {
      throw new ServiceUnavailableError("Billing subscription synchronization failed");
    }
  }
}

const billingService = new BillingService();
export default billingService;
