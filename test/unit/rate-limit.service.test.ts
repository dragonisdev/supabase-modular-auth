import { afterEach, describe, expect, it, vi } from "vitest";

import { RateLimitStoreService } from "../../backend/src/services/rate-limit.service.ts";
import * as SecurityLogger from "../../backend/src/utils/logger.ts";

interface RedisClientForTest {
  emit(event: string, error: Error): boolean;
  options: {
    pingInterval?: number;
    socket: { connectTimeout?: number; keepAlive?: boolean };
  };
}

const getClient = (service: RateLimitStoreService): RedisClientForTest =>
  (service as unknown as { client: RedisClientForTest }).client;

describe("RateLimitStoreService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([30_000, 0])("configures a Redis PING interval of %i milliseconds", (pingIntervalMs) => {
    const service = new RateLimitStoreService({
      connectTimeoutMs: 5000,
      keyPrefix: "test:rate-limit:",
      pingIntervalMs,
      redisUrl: "rediss://redis.example.test:6379",
    });
    const client = getClient(service);

    expect(client.options.pingInterval).toBe(pingIntervalMs);
    expect(client.options.socket).toMatchObject({ connectTimeout: 5000, keepAlive: true });
  });

  it("logs a safe reason for a connection failure", () => {
    const warn = vi.spyOn(SecurityLogger, "warn").mockImplementation(() => undefined);
    const service = new RateLimitStoreService({
      connectTimeoutMs: 5000,
      keyPrefix: "test:rate-limit:",
      redisUrl: "rediss://redis.example.test:6379",
    });

    getClient(service).emit(
      "error",
      Object.assign(new Error("Socket closed unexpectedly"), { code: "ECONNRESET" }),
    );

    expect(warn).toHaveBeenCalledWith("Redis rate-limit store connection error", {
      code: "ECONNRESET",
      errorName: "Error",
      reason: "ECONNRESET",
    });
  });
});
