import { describe, expect, it, vi } from "vitest";

import {
  StripeService,
  type StripeServiceOptions,
} from "../../backend/src/services/stripe.service.ts";
import { ServiceUnavailableError, ValidationError } from "../../backend/src/utils/errors.ts";

const createStripeMock = () => {
  const create = vi.fn();
  const constructEvent = vi.fn();
  const stripe = {
    checkout: { sessions: { create } },
    webhooks: { constructEvent },
  } as unknown as NonNullable<StripeServiceOptions["stripe"]>;

  return { constructEvent, create, stripe };
};

const createService = (stripe: NonNullable<StripeServiceOptions["stripe"]>) =>
  new StripeService({
    enabled: true,
    priceId: "price_smoke_test",
    stripe,
    webhookSecret: "whsec_test_secret",
  });

describe("StripeService", () => {
  it("creates a hosted one-time Checkout Session without product fulfillment", async () => {
    const { create, stripe } = createStripeMock();
    create.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/test" });
    const service = createService(stripe);

    await expect(
      service.createCheckoutTest({ id: "11111111-1111-4111-8111-111111111111" }),
    ).resolves.toEqual({ url: "https://checkout.stripe.com/test" });

    expect(create).toHaveBeenCalledWith({
      cancel_url: "http://127.0.0.1:3001/billing/test?checkout=cancelled",
      client_reference_id: "11111111-1111-4111-8111-111111111111",
      line_items: [{ price: "price_smoke_test", quantity: 1 }],
      metadata: {
        purpose: "integration_smoke_test",
        supabase_user_id: "11111111-1111-4111-8111-111111111111",
      },
      mode: "payment",
      success_url: "http://127.0.0.1:3001/billing/test?checkout=returned",
    });
  });

  it("fails closed when the smoke test is disabled", async () => {
    const { stripe } = createStripeMock();
    const service = new StripeService({ enabled: false, stripe });

    await expect(service.createCheckoutTest({ id: "user-id" })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it("normalizes provider failures and missing redirect URLs", async () => {
    const { create, stripe } = createStripeMock();
    const service = createService(stripe);

    create.mockRejectedValueOnce(new Error("provider detail"));
    await expect(service.createCheckoutTest({ id: "user-id" })).rejects.toMatchObject({
      message: "Stripe Checkout is temporarily unavailable",
      statusCode: 503,
    });

    create.mockResolvedValueOnce({ id: "cs_test_123", url: null });
    await expect(service.createCheckoutTest({ id: "user-id" })).rejects.toMatchObject({
      message: "Stripe Checkout did not return a redirect URL",
      statusCode: 503,
    });
  });

  it("verifies and describes a completed Checkout webhook", () => {
    const { constructEvent, stripe } = createStripeMock();
    constructEvent.mockReturnValue({
      data: {
        object: {
          id: "cs_test_123",
          object: "checkout.session",
          payment_status: "paid",
        },
      },
      id: "evt_test_123",
      type: "checkout.session.completed",
    });
    const service = createService(stripe);
    const payload = Buffer.from('{"id":"evt_test_123"}');

    expect(service.verifyWebhook(payload, "signature")).toEqual({
      checkoutCompleted: true,
      eventId: "evt_test_123",
      eventType: "checkout.session.completed",
      paymentStatus: "paid",
    });
    expect(constructEvent).toHaveBeenCalledWith(payload, "signature", "whsec_test_secret");
  });

  it("rejects invalid signatures without exposing provider details", () => {
    const { constructEvent, stripe } = createStripeMock();
    constructEvent.mockImplementation(() => {
      throw new Error("signature internals");
    });
    const service = createService(stripe);

    expect(() => service.verifyWebhook(Buffer.from("{}"), "invalid")).toThrow(ValidationError);
    expect(() => service.verifyWebhook(Buffer.from("{}"), "invalid")).toThrow(
      "Invalid Stripe webhook signature",
    );
  });
});
