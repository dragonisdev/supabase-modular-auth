import { describe, expect, it, vi } from "vitest";

import {
  StripeService,
  type StripeServiceOptions,
} from "../../backend/src/services/stripe.service.ts";
import { ServiceUnavailableError } from "../../backend/src/utils/errors.ts";

const createStripeMock = () => {
  const create = vi.fn();
  const retrieve = vi.fn();
  const stripe = {
    checkout: { sessions: { create } },
    prices: { retrieve },
  } as unknown as NonNullable<StripeServiceOptions["stripe"]>;

  return { create, retrieve, stripe };
};

const createService = (stripe: NonNullable<StripeServiceOptions["stripe"]>) =>
  new StripeService({
    priceId: "price_example",
    stripe,
  });

describe("StripeService", () => {
  it.each([
    [null, "payment"],
    [{ interval: "month" }, "subscription"],
  ] as const)("uses the configured Price to create a %s Checkout", async (recurring, mode) => {
    const { create, retrieve, stripe } = createStripeMock();
    retrieve.mockResolvedValue({ active: true, recurring });
    create.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
    const service = createService(stripe);

    await expect(
      service.createCheckout({ id: "11111111-1111-4111-8111-111111111111" }),
    ).resolves.toEqual({ url: "https://checkout.stripe.com/test" });

    expect(retrieve).toHaveBeenCalledWith("price_example");
    expect(create).toHaveBeenCalledWith({
      cancel_url: "http://127.0.0.1:3001/billing?checkout=cancelled",
      client_reference_id: "11111111-1111-4111-8111-111111111111",
      line_items: [{ price: "price_example", quantity: 1 }],
      metadata: {
        supabase_user_id: "11111111-1111-4111-8111-111111111111",
      },
      mode,
      success_url: "http://127.0.0.1:3001/billing?checkout=returned",
    });
  });

  it("fails closed when Stripe Checkout is not configured", async () => {
    const service = new StripeService({ stripe: null });

    await expect(service.createCheckout({ id: "user-id" })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it("normalizes provider failures and missing redirect URLs", async () => {
    const { create, retrieve, stripe } = createStripeMock();
    const service = createService(stripe);
    retrieve.mockResolvedValue({ active: true, recurring: null });

    retrieve.mockRejectedValueOnce(new Error("provider detail"));
    await expect(service.createCheckout({ id: "user-id" })).rejects.toMatchObject({
      message: "Stripe Checkout is temporarily unavailable",
      statusCode: 503,
    });

    create.mockResolvedValueOnce({ id: "cs_test_123", url: null });
    await expect(service.createCheckout({ id: "user-id" })).rejects.toMatchObject({
      message: "Stripe Checkout did not return a redirect URL",
      statusCode: 503,
    });
  });
});
