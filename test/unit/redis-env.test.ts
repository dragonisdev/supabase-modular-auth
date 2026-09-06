import { describe, expect, it } from "vitest";

import { envSchema } from "../../backend/src/config/env.ts";

const required = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  FRONTEND_URL: "https://app.example.test",
};
const rest = {
  ...required,
  REDIS_TRANSPORT: "rest",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "test-rest-token",
};

describe("Redis transport configuration", () => {
  it("preserves TCP as the default and accepts REST without a TCP URL", () => {
    expect(envSchema.parse(required).REDIS_TRANSPORT).toBe("tcp");
    expect(envSchema.parse(rest)).toMatchObject({
      REDIS_TRANSPORT: "rest",
      REDIS_REST_TIMEOUT_MS: 5000,
    });
  });

  it.each(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])(
    "requires %s for REST even in development",
    (key) => {
      expect(envSchema.safeParse({ ...rest, [key]: undefined }).success).toBe(false);
    },
  );

  it.each([
    "http://redis.example.test",
    "redis://redis.example.test",
    "https://user:secret@redis.example.test",
    "https://redis.example.test?token=secret",
    "https://redis.example.test/pipeline",
    "https://redis.example.test#fragment",
  ])("rejects unsafe or non-origin REST URLs: %s", (url) => {
    expect(envSchema.safeParse({ ...rest, UPSTASH_REDIS_REST_URL: url }).success).toBe(false);
  });

  it.each(["0", "-1", "30001", "nope"])("rejects REST timeout %s", (timeout) => {
    expect(envSchema.safeParse({ ...rest, REDIS_REST_TIMEOUT_MS: timeout }).success).toBe(false);
  });
});
