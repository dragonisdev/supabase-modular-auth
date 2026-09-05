import type { SupabaseClient } from "@supabase/supabase-js";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BillingService,
  type BillingServiceOptions,
} from "../../backend/src/services/billing.service.ts";
import SupabaseService from "../../backend/src/services/supabase.service.ts";

type StripeClient = NonNullable<BillingServiceOptions["stripe"]>;

const serviceOptions = (stripe: StripeClient | null) => ({
  enabled: true,
  frontendUrl: "http://127.0.0.1:3001",
  priceIds: ["price_monthly"],
  stripe,
  webhookSecret: "whsec_test",
});

const asStripe = (value: object): StripeClient => value as unknown as StripeClient;
const asSupabase = (value: object): SupabaseClient => value as unknown as SupabaseClient;

describe("BillingService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a stable disabled overview without calling Stripe or Supabase", async () => {
    const getAdminClient = vi.spyOn(SupabaseService, "getAdminClient");
    const service = new BillingService({ enabled: false, stripe: null });

    await expect(service.getOverview("user-1")).resolves.toEqual({
      enabled: false,
      plans: [],
      subscriptions: [],
    });
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it("derives the catalog from allowlisted recurring Stripe prices", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      currency: "eur",
      id: "price_monthly",
      product: {
        deleted: false,
        description: "A hosted recurring plan",
        name: "Monthly",
      },
      recurring: { interval: "month", interval_count: 1 },
      unit_amount: 2900,
    });
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          cancel_at_period_end: false,
          current_period_end: "2026-09-24T00:00:00.000Z",
          current_period_start: "2026-08-24T00:00:00.000Z",
          price_id: "price_monthly",
          provider_subscription_id: "sub_1",
          status: "active",
        },
      ],
      error: null,
    });
    vi.spyOn(SupabaseService, "getAdminClient").mockReturnValue(
      asSupabase({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ order })),
          })),
        })),
      }),
    );
    const service = new BillingService(serviceOptions(asStripe({ prices: { retrieve } })));

    await expect(service.getOverview("user-1")).resolves.toEqual({
      enabled: true,
      plans: [
        {
          currency: "eur",
          description: "A hosted recurring plan",
          interval: "month",
          intervalCount: 1,
          name: "Monthly",
          priceId: "price_monthly",
          unitAmount: 2900,
        },
      ],
      subscriptions: [
        {
          cancelAtPeriodEnd: false,
          currentPeriodEnd: "2026-09-24T00:00:00.000Z",
          currentPeriodStart: "2026-08-24T00:00:00.000Z",
          priceId: "price_monthly",
          providerSubscriptionId: "sub_1",
          status: "active",
        },
      ],
    });
    expect(retrieve).toHaveBeenCalledWith("price_monthly", { expand: ["product"] });
  });

  it("rejects a checkout price outside the server allowlist", async () => {
    const retrieve = vi.fn();
    const service = new BillingService(serviceOptions(asStripe({ prices: { retrieve } })));

    await expect(
      service.createCheckoutSession({ id: "user-1" }, "price_attacker"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("creates hosted Checkout for an existing mapped Stripe customer", async () => {
    const checkoutCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const retrieve = vi.fn().mockResolvedValue({
      active: true,
      id: "price_monthly",
      recurring: { interval: "month" },
      unit_amount: 2900,
    });
    vi.spyOn(SupabaseService, "getAdminClient").mockReturnValue(
      asSupabase({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { provider_customer_id: "cus_1", user_id: "user-1" },
                error: null,
              }),
            })),
          })),
        })),
      }),
    );
    const stripe = asStripe({
      checkout: { sessions: { create: checkoutCreate } },
      prices: { retrieve },
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
      },
    });
    const service = new BillingService(serviceOptions(stripe));

    await expect(
      service.createCheckoutSession({ email: "user@example.com", id: "user-1" }, "price_monthly"),
    ).resolves.toBe("https://checkout.stripe.com/test");
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: "user-1",
        customer: "cus_1",
        line_items: [{ price: "price_monthly", quantity: 1 }],
        mode: "subscription",
      }),
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^checkout:user-1:/) }),
    );
  });

  it("requires existing subscribers to manage billing through the hosted portal", async () => {
    const checkoutCreate = vi.fn();
    vi.spyOn(SupabaseService, "getAdminClient").mockReturnValue(
      asSupabase({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { provider_customer_id: "cus_1", user_id: "user-1" },
                error: null,
              }),
            })),
          })),
        })),
      }),
    );
    const stripe = asStripe({
      checkout: { sessions: { create: checkoutCreate } },
      prices: {
        retrieve: vi.fn().mockResolvedValue({
          active: true,
          recurring: { interval: "month" },
          unit_amount: 2900,
        }),
      },
      subscriptions: {
        list: vi.fn().mockResolvedValue({
          data: [{ status: "active" }],
          has_more: false,
        }),
      },
    });
    const service = new BillingService(serviceOptions(stripe));

    await expect(
      service.createCheckoutSession({ id: "user-1" }, "price_monthly"),
    ).rejects.toMatchObject({
      message: "An existing subscription must be managed through the billing portal",
      statusCode: 400,
    });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate processed webhook without applying it again", async () => {
    const update = vi.fn();
    vi.spyOn(SupabaseService, "getAdminClient").mockReturnValue(
      asSupabase({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { attempts: 1, status: "processed" },
                error: null,
              }),
            })),
          })),
          update,
        })),
      }),
    );
    const event = {
      created: 1_777_000_000,
      data: { object: { object: "invoice" } },
      id: "evt_duplicate",
      type: "invoice.paid",
    };
    const constructEvent = vi.fn().mockReturnValue(event);
    const service = new BillingService(serviceOptions(asStripe({ webhooks: { constructEvent } })));

    await expect(service.handleWebhook(Buffer.from("{}"), "signature")).resolves.toEqual({
      eventId: "evt_duplicate",
      eventType: "invoice.paid",
      processed: false,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("records a forced administrative replay as a new processing attempt", async () => {
    const updates: object[] = [];
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { attempts: 2, status: "processed" },
            error: null,
          }),
        })),
      })),
      update: vi.fn((value: object) => {
        updates.push(value);
        return { eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    }));
    vi.spyOn(SupabaseService, "getAdminClient").mockReturnValue(asSupabase({ from }));
    const event = {
      created: 1_777_000_000,
      data: { object: { object: "invoice" } },
      id: "evt_replay",
      type: "invoice.paid",
    };
    const service = new BillingService(
      serviceOptions(asStripe({ events: { retrieve: vi.fn().mockResolvedValue(event) } })),
    );

    await expect(service.replayWebhook("evt_replay")).resolves.toEqual({
      eventId: "evt_replay",
      eventType: "invoice.paid",
      processed: true,
    });
    expect(updates).toEqual([
      { attempts: 3, last_error_code: null, status: "processing" },
      expect.objectContaining({ last_error_code: null, status: "processed" }),
    ]);
  });
});
