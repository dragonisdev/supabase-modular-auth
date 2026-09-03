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

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} signal received: closing HTTP server`);
  let exitCode = 0;

  try {
    if (server) {
      const activeServer = server;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => activeServer.closeAllConnections(),
          HTTP_SHUTDOWN_TIMEOUT_MS,
        );
        activeServer.close((error) => {
          clearTimeout(timeout);
          return error ? reject(error) : resolve();
        });
      });
    }
  } catch (error) {
    exitCode = 1;
    SecurityLogger.logError(normalizeError(error), undefined, {
      operation: "http_server_shutdown",
      signal,
    });
  } finally {
    try {
      await rateLimitStoreService.disconnect();
    } catch (error) {
      exitCode = 1;
      SecurityLogger.logError(normalizeError(error), undefined, {
        operation: "rate_limit_store_shutdown",
        signal,
      });
    } finally {
      process.exit(exitCode);
    }
  }
};

// Graceful shutdown
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("unhandledRejection", (reason: Error) => {
  console.error("Unhandled Rejection:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error: Error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

void bootstrap().catch(async (error: unknown) => {
  console.error("Backend startup failed");
  SecurityLogger.logError(normalizeError(error), undefined, {
    operation: "backend_startup",
  });

  try {
    await rateLimitStoreService.disconnect();
  } catch (disconnectError) {
    SecurityLogger.logError(normalizeError(disconnectError), undefined, {
      operation: "rate_limit_store_startup_cleanup",
    });
  } finally {
    process.exit(1);
  }
});
