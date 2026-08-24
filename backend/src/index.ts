import App from "./app.js";
import { rateLimitStoreService } from "./services/rate-limit.service.js";

let server: ReturnType<App["listen"]> | undefined;

const bootstrap = async (): Promise<void> => {
  await rateLimitStoreService.connect();
  const app = new App();
  server = app.listen();
};

const shutdown = async (signal: string): Promise<void> => {
  console.log(`${signal} signal received: closing HTTP server`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await rateLimitStoreService.disconnect();
  process.exit(0);
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

void bootstrap().catch(async () => {
  console.error("Backend startup failed");
  await rateLimitStoreService.disconnect();
  process.exit(1);
});
