import express from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../backend/src/middleware/error.middleware.ts";
import { createRateLimiter } from "../../backend/src/middleware/rate-limit.middleware.ts";
import { RateLimitStoreService } from "../../backend/src/services/rate-limit.service.ts";

const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describe("Redis rate-limit startup", () => {
  it("fails after bounded retries when Redis is unavailable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const service = new RateLimitStoreService({
      connectTimeoutMs: 50,
      keyPrefix: "test:rate-limit:unavailable:",
      redisUrl: "redis://127.0.0.1:1",
    });

    await expect(service.connect()).rejects.toMatchObject({
      statusCode: 503,
      message: "Rate limiting service failed to initialize",
    });
    await expect(service.disconnect()).resolves.toBeUndefined();
  });
});

describeWithRedis("Redis rate-limit integration", () => {
  const prefix = `test:rate-limit:${randomUUID()}:`;
  const firstService = new RateLimitStoreService({
    connectTimeoutMs: 2000,
    keyPrefix: prefix,
    redisUrl,
  });
  const secondService = new RateLimitStoreService({
    connectTimeoutMs: 2000,
    keyPrefix: prefix,
    redisUrl,
  });

  beforeAll(async () => {
    await Promise.all([firstService.connect(), secondService.connect()]);
  });

  afterAll(async () => {
    await Promise.all([firstService.disconnect(), secondService.disconnect()]);
  });

  it("shares counters across independent backend instances", async () => {
    const createApp = (service: RateLimitStoreService): express.Express => {
      const app = express();

      app.use(
        createRateLimiter(
          "cross-instance",
          {
            windowMs: 60_000,
            max: 2,
            keyGenerator: () => "shared-client",
            standardHeaders: "draft-7",
            legacyHeaders: false,
          },
          service,
        ),
      );
      app.get("/limited", (_req, res) => res.status(200).json({ success: true }));
      app.use(errorHandler);

      return app;
    };

    const firstApp = createApp(firstService);
    const secondApp = createApp(secondService);

    expect((await request(firstApp).get("/limited")).status).toBe(200);
    expect((await request(secondApp).get("/limited")).status).toBe(200);
    expect((await request(firstApp).get("/limited")).status).toBe(429);
  });

  it("fails closed when Redis becomes unavailable", async () => {
    const service = new RateLimitStoreService({
      connectTimeoutMs: 2000,
      keyPrefix: `${prefix}outage:`,
      redisUrl,
    });
    await service.connect();

    const app = express();
    app.use(
      createRateLimiter(
        "fail-closed",
        {
          windowMs: 60_000,
          max: 10,
          keyGenerator: () => "outage-client",
        },
        service,
      ),
    );
    app.get("/limited", (_req, res) => res.status(200).json({ success: true }));
    app.use(errorHandler);

    expect((await request(app).get("/limited")).status).toBe(200);
    await service.disconnect();

    const response = await request(app).get("/limited");
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: "SERVICE_UNAVAILABLE",
      message: "Rate limiting service temporarily unavailable",
    });
  });
});
