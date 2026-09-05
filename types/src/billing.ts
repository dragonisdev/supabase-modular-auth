import { z } from "zod";

export const stripePriceIdSchema = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/, "Invalid Stripe price identifier")
  .max(128);

export const stripeEventIdSchema = z
  .string()
  .trim()
  .regex(/^evt_[A-Za-z0-9]+$/, "Invalid Stripe event identifier")
  .max(128);

export const billingCheckoutSchema = z.object({
  priceId: stripePriceIdSchema,
});

export const billingReconcileSchema = z.object({
  userId: z.uuid(),
});

export interface BillingPlan {
  currency: string;
  description: string | null;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  name: string;
  priceId: string;
  unitAmount: number;
}

export interface BillingSubscription {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  priceId: string | null;
  providerSubscriptionId: string;
  status:
    | "active"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "past_due"
    | "paused"
    | "trialing"
    | "unpaid";
}

export interface BillingOverviewData {
  enabled: boolean;
  plans: BillingPlan[];
  subscriptions: BillingSubscription[];
}

export interface BillingRedirectData {
  url: string;
}

export interface BillingReconcileResult {
  customerFound: boolean;
  subscriptionsSynchronized: number;
  userId: string;
}

export interface BillingWebhookReplayResult {
  eventId: string;
  eventType: string;
  processed: boolean;
}

export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;
export type BillingReconcileInput = z.infer<typeof billingReconcileSchema>;
