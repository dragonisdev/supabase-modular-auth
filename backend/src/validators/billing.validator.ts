import {
  billingCheckoutSchema,
  billingReconcileSchema,
  stripeEventIdSchema,
} from "@supabase-modular-auth/types";

export const checkoutBodySchema = billingCheckoutSchema;
export const reconcileBodySchema = billingReconcileSchema;
export const webhookEventIdSchema = stripeEventIdSchema;
