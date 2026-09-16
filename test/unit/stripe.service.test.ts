import { describe, expect, it, vi } from "vitest";

import type { BillingStore } from "../../backend/src/services/billing-store.service.ts";

import {
  StripeService,
  type StripeServiceOptions,
} from "../../backend/src/services/stripe.service.ts";
import { ServiceUnavailableError, ValidationError } from "../../backend/src/utils/errors.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const createStoreMock = () => {
  const createAccount = vi.fn().mockResolvedValue("cus_example");
  const fulfillCreditPurchase = vi.fn().mockResolvedValue({ applied: true, balance: 20 });
  const getBalance = vi.fn().mockResolvedValue(0);
  const getCustomerId = vi.fn().mockResolvedValue("cus_example");
  const store: BillingStore = {
    createAccount,
    fulfillCreditPurchase,
    getBalance,
    getCustomerId,
  };

  return { createAccount, fulfillCreditPurchase, getBalance, getCustomerId, store };
};

const createStripeMock = () => {
  const customerCreate = vi.fn();
  const sessionCreate = vi.fn();
  const sessionRetrieve = vi.fn();
  const priceRetrieve = vi.fn();
  const constructEvent = vi.fn();
  const stripe = {
    checkout: { sessions: { create: sessionCreate, retrieve: sessionRetrieve } },
    customers: { create: customerCreate },
    prices: { retrieve: priceRetrieve },
    webhooks: { constructEvent },
  } as unknown as NonNullable<StripeServiceOptions["stripe"]>;

  return {
    constructEvent,
    customerCreate,
    priceRetrieve,
    sessionCreate,
    sessionRetrieve,
    stripe,
  };
};

const createService = (
  stripe: NonNullable<StripeServiceOptions["stripe"]>,
  store = createStoreMock().store,
) =>
  new StripeService({
    creditsPerPurchase: 20,
    priceId: "price_example",
    store,
    stripe,
    webhookSecret: "whsec_example_secret",
  });

describe("StripeService", () => {
  it("returns the ledger-derived balance and server-configured pack size", async () => {
    const { getBalance, store } = createStoreMock();
    getBalance.mockResolvedValue(37);
    const { stripe } = createStripeMock();

    await expect(createService(stripe, store).getOverview(USER_ID)).resolves.toEqual({
      credits: 37,
      creditsPerPurchase: 20,
    });
    expect(getBalance).toHaveBeenCalledWith(USER_ID);
  });

  it("creates one-time Checkout for the server-configured Price and customer", async () => {
    const { priceRetrieve, sessionCreate, stripe } = createStripeMock();
    priceRetrieve.mockResolvedValue({ active: true, recurring: null, unit_amount: 1000 });
    sessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    const service = createService(stripe);

    await expect(
      service.createCheckout({ email: "user@example.com", id: USER_ID }),
    ).resolves.toEqual({ url: "https://checkout.stripe.com/test" });

    expect(priceRetrieve).toHaveBeenCalledWith("price_example");
    expect(sessionCreate).toHaveBeenCalledWith({
      cancel_url: "http://127.0.0.1:3001/billing?checkout=cancelled",
      client_reference_id: USER_ID,
      customer: "cus_example",
      line_items: [{ price: "price_example", quantity: 1 }],
      metadata: { supabase_user_id: USER_ID },
      mode: "payment",
      payment_method_types: ["card"],
      success_url: "http://127.0.0.1:3001/billing?checkout=returned",
    });
  });

  it("creates and persists a Stripe customer when the user has no billing account", async () => {
    const { createAccount, getCustomerId, store } = createStoreMock();
    getCustomerId.mockResolvedValue(null);
    const { customerCreate, priceRetrieve, sessionCreate, stripe } = createStripeMock();
    priceRetrieve.mockResolvedValue({ active: true, recurring: null, unit_amount: 1000 });
    customerCreate.mockResolvedValue({ id: "cus_new" });
    sessionCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    createAccount.mockResolvedValue("cus_new");

    await createService(stripe, store).createCheckout({ email: "user@example.com", id: USER_ID });

    expect(customerCreate).toHaveBeenCalledWith(
      { email: "user@example.com", metadata: { supabase_user_id: USER_ID } },
      { idempotencyKey: `customer:${USER_ID}` },
    );
    expect(createAccount).toHaveBeenCalledWith(USER_ID, "cus_new");
  });

  it("rejects recurring, inactive, and amount-less Prices", async () => {
    const { priceRetrieve, stripe } = createStripeMock();
    priceRetrieve.mockResolvedValue({
      active: true,
      recurring: { interval: "month" },
      unit_amount: 1000,
    });

    await expect(createService(stripe).createCheckout({ id: USER_ID })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("fails closed when Stripe Checkout is not configured", async () => {
    const service = new StripeService({ store: createStoreMock().store, stripe: null });

    await expect(service.createCheckout({ id: USER_ID })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });

  it("verifies, re-reads, and idempotently fulfills a paid Checkout event", async () => {
    const { fulfillCreditPurchase, store } = createStoreMock();
    const { constructEvent, sessionRetrieve, stripe } = createStripeMock();
    constructEvent.mockReturnValue({
      data: { object: { id: "cs_test_123" } },
      id: "evt_123",
      type: "checkout.session.completed",
    });
    sessionRetrieve.mockResolvedValue({
      amount_total: 1000,
      client_reference_id: USER_ID,
      currency: "usd",
      customer: "cus_example",
      id: "cs_test_123",
      line_items: { data: [{ price: { id: "price_example" }, quantity: 1 }] },
      metadata: { supabase_user_id: USER_ID },
      mode: "payment",
      payment_intent: "pi_123",
      payment_status: "paid",
    });

    await expect(
      createService(stripe, store).handleWebhook(Buffer.from("{}"), "signature"),
    ).resolves.toEqual({
      balance: 20,
      creditsGranted: 20,
      eventId: "evt_123",
      eventType: "checkout.session.completed",
      processed: true,
    });
    expect(constructEvent).toHaveBeenCalledWith(
      expect.any(Buffer),
      "signature",
      "whsec_example_secret",
    );
    expect(sessionRetrieve).toHaveBeenCalledWith("cs_test_123", {
      expand: ["line_items.data.price"],
    });
    expect(fulfillCreditPurchase).toHaveBeenCalledWith({
      amountTotal: 1000,
      credits: 20,
      currency: "usd",
      eventId: "evt_123",
      paymentIntentId: "pi_123",
      priceId: "price_example",
      sessionId: "cs_test_123",
      stripeCustomerId: "cus_example",
      userId: USER_ID,
    });
  });

  it("rejects invalid signatures and inconsistent fulfillment data", async () => {
    const { constructEvent, sessionRetrieve, stripe } = createStripeMock();
    constructEvent.mockImplementationOnce(() => {
      throw new Error("bad signature");
    });
    const service = createService(stripe);

    await expect(service.handleWebhook(Buffer.from("{}"), "bad")).rejects.toBeInstanceOf(
      ValidationError,
    );

    constructEvent.mockReturnValue({
      data: { object: { id: "cs_test_123" } },
      id: "evt_123",
      type: "checkout.session.completed",
    });
    sessionRetrieve.mockResolvedValue({ payment_status: "unpaid" });
    await expect(service.handleWebhook(Buffer.from("{}"), "signature")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("acknowledges unrelated signed Stripe events without touching billing state", async () => {
    const { fulfillCreditPurchase, store } = createStoreMock();
    const { constructEvent, stripe } = createStripeMock();
    constructEvent.mockReturnValue({
      data: { object: {} },
      id: "evt_unrelated",
      type: "customer.created",
    });

    await expect(
      createService(stripe, store).handleWebhook(Buffer.from("{}"), "signature"),
    ).resolves.toEqual({
      balance: null,
      creditsGranted: 0,
      eventId: "evt_unrelated",
      eventType: "customer.created",
      processed: false,
    });
    expect(fulfillCreditPurchase).not.toHaveBeenCalled();
  });
});
