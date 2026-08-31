import type { Server } from "node:http";

import { describe, expect, it, vi } from "vitest";

import { closeServerWithDeadline } from "../../backend/src/utils/server-shutdown.ts";

const createServer = (close: Server["close"], closeIdleConnections = vi.fn()): Server =>
  ({
    close,
    closeIdleConnections,
  }) as unknown as Server;

describe("closeServerWithDeadline", () => {
  it("closes idle connections before closing the server", async () => {
    const order: string[] = [];
    const closeIdleConnections = vi.fn(() => order.push("idle"));
    const server = createServer(
      ((callback) => {
        order.push("close");
        callback?.();
        return server;
      }) as Server["close"],
      closeIdleConnections,
    );

    await expect(closeServerWithDeadline(server, 50)).resolves.toBeUndefined();
    expect(order).toEqual(["idle", "close"]);
  });

  it("rejects when active requests outlive the deadline", async () => {
    const closeIdleConnections = vi.fn();
    const server = createServer((() => server) as Server["close"], closeIdleConnections);

    await expect(closeServerWithDeadline(server, 10)).rejects.toThrow(
      "HTTP server shutdown exceeded the 10ms deadline",
    );
    expect(closeIdleConnections).toHaveBeenCalledOnce();
  });
});
