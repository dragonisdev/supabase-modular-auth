import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../backend/src/middleware/error.middleware.ts";
import { createRateLimiter } from "../../backend/src/middleware/rate-limit.middleware.ts";
import { RateLimitStoreService } from "../../backend/src/services/rate-limit.service.ts";
import { sendRedisRestCommand } from "../../backend/src/services/redis-rest.ts";
import * as SecurityLogger from "../../backend/src/utils/logger.ts";

const options = {
  url: "https://redis.example.test",
  token: "test-rest-secret",
  timeoutMs: 100,
};
const createService = () =>
  new RateLimitStoreService({
    transport: "rest",
    // REST selection must ignore a leftover TCP URL.
    redisUrl: "redis://127.0.0.1:1",
    connectTimeoutMs: 50,
    keyPrefix: "test:rest:",
    restUrl: options.url,
    restToken: options.token,
    restTimeoutMs: options.timeoutMs,
  });

describe("Redis REST transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses authenticated POST commands with a fresh deadline and no redirects", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ result: "PONG" }));
    vi.stubGlobal("fetch", fetchMock);
    const service = createService();
    await service.connect();
    await service.connect();
    await service.disconnect();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(options.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}`, "Content-Type": "application/json" },
      body: '["PING"]',
      signal: expect.any(AbortSignal),
      redirect: "error",
      cache: "no-store",
    });
    expect(fetchMock.mock.calls[0][1].signal).not.toBe(fetchMock.mock.calls[1][1].signal);
  });

  it.each([
    [401, { error: "secret provider message" }],
    [429, { error: "quota exceeded" }],
    [503, { result: "PONG" }],
    [200, { error: "provider command failed" }],
    [200, { unexpected: "PONG" }],
    [200, { result: "not-PONG" }],
  ])("fails startup closed on HTTP %i / invalid replies", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
    vi.spyOn(SecurityLogger, "warn").mockImplementation(() => undefined);
    await expect(createService().connect()).rejects.toMatchObject({ statusCode: 503 });
  });

  it("bounds a stalled request and does not retry it", async () => {
    const fetchMock = vi.fn(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(SecurityLogger, "warn").mockImplementation(() => undefined);

    await expect(createService().connect()).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("Redis rate-limit store command failed", {
      transport: "rest",
      reason: "TIMEOUT",
    });
  });

  it("rejects malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON")));
    await expect(sendRedisRestCommand(options, ["PING"])).rejects.toThrow();
  });

  it("normalizes Upstash null replies for rate-limit-redis", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ result: [null, 45_000] })));

    await expect(sendRedisRestCommand(options, ["EVALSHA", "sha", "1", "key"])).resolves.toEqual([
      false,
      45_000,
    ]);
  });

  it("reloads a missing script and retains the scope, count and expiration", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: "increment-sha" }))
      .mockResolvedValueOnce(Response.json({ result: "get-sha" }))
      .mockResolvedValueOnce(
        Response.json({ error: "NOSCRIPT No matching script" }, { status: 400 }),
      )
      .mockResolvedValueOnce(Response.json({ result: "reloaded-sha" }))
      .mockResolvedValueOnce(Response.json({ result: [2, 45_000] }));
    vi.stubGlobal("fetch", fetchMock);
    const store = createService().createStore("auth")!;
    await store.init({ windowMs: 60_000 } as Parameters<typeof store.init>[0]);
    const before = Date.now();
    const result = await store.increment("client");

    expect(result.totalHits).toBe(2);
    expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + 45_000);
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual([
      "EVALSHA",
      "reloaded-sha",
      "1",
      "test:rest:auth:client",
      "60000",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it.each(["increment", "get"] as const)(
    "recovers %s after script loading failed during initialization",
    async (operation) => {
      let unavailable = true;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, init: RequestInit) => {
          if (unavailable) {
            return Response.json({ error: "unavailable" }, { status: 503 });
          }
          const command: string[] = JSON.parse(init.body as string);
          return Response.json({ result: command[0] === "SCRIPT" ? "script-sha" : [1, 60_000] });
        }),
      );
      vi.spyOn(SecurityLogger, "warn").mockImplementation(() => undefined);
      const store = createService().createStore("auth")!;
      await expect(
        store.init({ windowMs: 60_000 } as Parameters<typeof store.init>[0]),
      ).rejects.toMatchObject({ statusCode: 503 });
      unavailable = false;
      await expect(store[operation]("client")).resolves.toMatchObject({ totalHits: 1 });
    },
  );

  it("returns 429 at the limit, 503 during an outage, and recovers on the next request", async () => {
    let hits = 0;
    let unavailable = false;
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      const command: string[] = JSON.parse(init.body as string);
      if (unavailable) {
        throw new Error(`network failure ${options.token} ${options.url}`);
      }
      if (command[0] === "SCRIPT") {
        return Response.json({ result: "script-sha" });
      }
      return Response.json({ result: [++hits, 60_000] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(SecurityLogger, "warn").mockImplementation(() => undefined);
    vi.spyOn(SecurityLogger, "logError").mockImplementation(() => undefined);
    const app = express();
    app.use(
      createRateLimiter(
        "auth",
        {
          windowMs: 60_000,
          max: 2,
          keyGenerator: () => "client",
        },
        createService(),
      ),
    );
    app.get("/limited", (_req, res) => res.sendStatus(200));
    app.use(errorHandler);

    expect((await request(app).get("/limited")).status).toBe(200);
    expect((await request(app).get("/limited")).status).toBe(200);
    expect((await request(app).get("/limited")).status).toBe(429);
    unavailable = true;
    const callsBefore = fetchMock.mock.calls.length;
    const outage = await request(app).get("/limited");
    expect(outage.status).toBe(503);
    expect(outage.body).toMatchObject({ error: "SERVICE_UNAVAILABLE" });
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(options.token);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(options.url);
    unavailable = false;
    // The same limiter resumes using Redis without restarting or falling back to memory.
    expect((await request(app).get("/limited")).status).toBe(429);
  });
});
