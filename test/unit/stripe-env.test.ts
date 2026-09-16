import { describe, expect, it } from "vitest";

import { envSchema } from "../../backend/src/config/env.ts";

const required = {
  FRONTEND_URL: "https://app.example.test",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_URL: "https://project.supabase.co",
};

const configured = {
  ...required,
  STRIPE_SECRET_KEY: "sk_test_example_secret",
  STRIPE_PRICE_ID: "price_example123",
  STRIPE_WEBHOOK_SECRET: "whsec_example_secret",
};

describe("Stripe configuration", () => {
  it("is optional by default", () => {
    expect(envSchema.parse(required).STRIPE_SECRET_KEY).toBeUndefined();
  });

  it.each(["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET"] as const)(
    "requires %s when Stripe billing is configured",
    (key) => {
      expect(envSchema.safeParse({ ...configured, [key]: undefined }).success).toBe(false);
    },
  );

  it("accepts test and live Stripe secret keys", () => {
    expect(envSchema.safeParse(configured).success).toBe(true);
    expect(
      envSchema.safeParse({ ...configured, STRIPE_SECRET_KEY: "sk_live_example_secret" }).success,
    ).toBe(true);
  });

  it("defaults each paid Checkout to 20 credits", () => {
    expect(envSchema.parse(required).STRIPE_CREDITS_PER_PURCHASE).toBe(20);
  });
});
