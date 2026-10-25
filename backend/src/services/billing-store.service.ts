import type { SupabaseClient } from "@supabase/supabase-js";

import { ServiceUnavailableError } from "../utils/errors.js";
import SupabaseService from "./supabase.service.js";

interface BillingAccountRow {
  stripe_customer_id: string;
  user_id: string;
}

interface FulfillmentRow {
  applied: boolean;
  balance: number | string;
}

export interface CreditPurchase {
  amountTotal: number;
  credits: number;
  currency: string;
  eventId: string;
  paymentIntentId: string;
  priceId: string;
  sessionId: string;
  stripeCustomerId: string;
  userId: string;
}

export interface CreditFulfillmentResult {
  applied: boolean;
  balance: number;
}

export interface BillingStore {
  createAccount(userId: string, stripeCustomerId: string): Promise<string>;
  fulfillCreditPurchase(purchase: CreditPurchase): Promise<CreditFulfillmentResult>;
  getBalance(userId: string): Promise<number>;
  getCustomerId(userId: string): Promise<string | null>;
}

export class SupabaseBillingStore implements BillingStore {
  constructor(private readonly adminClient: SupabaseClient = SupabaseService.getAdminClient()) {}

  public async getCustomerId(userId: string): Promise<string | null> {
    const { data, error } = await this.adminClient
      .from("billing_accounts")
      .select("user_id,stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new ServiceUnavailableError("Billing account lookup failed");
    }

    return (data as BillingAccountRow | null)?.stripe_customer_id ?? null;
  }

  public async createAccount(userId: string, stripeCustomerId: string): Promise<string> {
    const { error } = await this.adminClient.from("billing_accounts").insert({
      stripe_customer_id: stripeCustomerId,
      user_id: userId,
    });

    if (!error) {
      return stripeCustomerId;
    }

    // A concurrent request may have inserted the account first. Re-read instead
    // of overwriting an established user-to-customer association.
    const existingCustomerId = await this.getCustomerId(userId);
    if (existingCustomerId) {
      return existingCustomerId;
    }

    throw new ServiceUnavailableError("Billing account persistence failed");
  }

  public async getBalance(userId: string): Promise<number> {
    const { data, error } = await this.adminClient.rpc("get_billing_credit_balance", {
      p_user_id: userId,
    });

    if (error) {
      throw new ServiceUnavailableError("Billing balance is temporarily unavailable");
    }

    return Number(data ?? 0);
  }

  public async fulfillCreditPurchase(purchase: CreditPurchase): Promise<CreditFulfillmentResult> {
    const { data, error } = await this.adminClient.rpc("fulfill_stripe_credit_purchase", {
      p_amount_total: purchase.amountTotal,
      p_credit_amount: purchase.credits,
      p_currency: purchase.currency,
      p_stripe_customer_id: purchase.stripeCustomerId,
      p_stripe_event_id: purchase.eventId,
      p_stripe_payment_intent_id: purchase.paymentIntentId,
      p_stripe_price_id: purchase.priceId,
      p_stripe_session_id: purchase.sessionId,
      p_user_id: purchase.userId,
    });

    const row = Array.isArray(data) ? (data[0] as FulfillmentRow | undefined) : undefined;
    if (error || !row) {
      throw new ServiceUnavailableError("Billing fulfillment persistence failed");
    }

    return { applied: row.applied, balance: Number(row.balance) };
  }
}
