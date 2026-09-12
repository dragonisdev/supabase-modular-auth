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
};

describe("Stripe configuration", () => {
  it("is optional by default", () => {
    expect(envSchema.parse(required).STRIPE_SECRET_KEY).toBeUndefined();
  });

  it("requires a secret key when a Price is configured", () => {
    expect(envSchema.safeParse({ ...configured, STRIPE_SECRET_KEY: undefined }).success).toBe(
      false,
    );
  });

  it("accepts test and live Stripe secret keys", () => {
    expect(envSchema.safeParse(configured).success).toBe(true);
    expect(
      envSchema.safeParse({ ...configured, STRIPE_SECRET_KEY: "sk_live_example_secret" }).success,
    ).toBe(true);
  });
});
