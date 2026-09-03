import App from "./app.js";
import { rateLimitStoreService } from "./services/rate-limit.service.js";
import * as SecurityLogger from "./utils/logger.js";

let server: ReturnType<App["listen"]> | undefined;
const HTTP_SHUTDOWN_TIMEOUT_MS = 8_000;

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Unknown lifecycle error");

const bootstrap = async (): Promise<void> => {
  await rateLimitStoreService.connect();
  const app = new App();
  server = app.listen();
};

const shutdown = (signal: string): void => {
  console.log(`${signal} signal received: closing HTTP server`);
  if (!server) {
    process.exit(0);
    return;
  }

  const activeServer = server;
  const timeout = setTimeout(() => activeServer.closeAllConnections(), HTTP_SHUTDOWN_TIMEOUT_MS);
  activeServer.close((error) => {
    clearTimeout(timeout);
    if (error) {
      SecurityLogger.logError(normalizeError(error), undefined, {
        operation: "http_server_shutdown",
        signal,
      });
      process.exit(1);
      return;
    }

    process.exit(0);
  });
};

// Graceful shutdown
process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("unhandledRejection", (reason: Error) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

void bootstrap().catch((error: unknown) => {
  console.error("Backend startup failed");
  SecurityLogger.logError(normalizeError(error), undefined, {
    operation: "backend_startup",
  });
  process.exit(1);
});
