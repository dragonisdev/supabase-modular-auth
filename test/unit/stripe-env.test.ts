import { describe, expect, it } from "vitest";

import { envSchema } from "../../backend/src/config/env.ts";

const required = {
  FRONTEND_URL: "https://app.example.test",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_URL: "https://project.supabase.co",
};

const enabled = {
  ...required,
  STRIPE_SECRET_KEY: "sk_test_example_secret",
  STRIPE_SMOKE_TEST_ENABLED: "true",
  STRIPE_TEST_PRICE_ID: "price_example123",
  STRIPE_WEBHOOK_SECRET: "whsec_example_secret",
};

describe("Stripe smoke-test configuration", () => {
  it("is disabled by default", () => {
    expect(envSchema.parse(required).STRIPE_SMOKE_TEST_ENABLED).toBe(false);
  });

  it("requires all provider values when enabled", () => {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_TEST_PRICE_ID",
      "STRIPE_WEBHOOK_SECRET",
    ] as const) {
      expect(envSchema.safeParse({ ...enabled, [key]: undefined }).success).toBe(false);
    }
  });

  it("accepts only a test secret for the enabled smoke test", () => {
    expect(envSchema.safeParse(enabled).success).toBe(true);
    expect(
      envSchema.safeParse({ ...enabled, STRIPE_SECRET_KEY: "sk_live_example_secret" }).success,
    ).toBe(false);
  });

  it.each(["0", "1.1mb", "2mb", "unbounded"])("rejects unsafe webhook body limit %s", (limit) => {
    expect(envSchema.safeParse({ ...required, STRIPE_WEBHOOK_MAX_SIZE: limit }).success).toBe(
      false,
    );
  });
});
