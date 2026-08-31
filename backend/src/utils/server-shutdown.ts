import type { Server } from "node:http";

const shutdownTimeoutError = (timeoutMs: number): Error =>
  new Error(`HTTP server shutdown exceeded the ${timeoutMs}ms deadline`);

/**
 * Stop accepting work without allowing open keep-alive sockets to consume the
 * deployment platform's termination grace period.
 */
export const closeServerWithDeadline = (server: Server, timeoutMs: number): Promise<void> => {
  server.closeIdleConnections();

  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(shutdownTimeoutError(timeoutMs));
    }, timeoutMs);

    try {
      server.close((error) => {
        clearTimeout(deadline);

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    } catch (error) {
      clearTimeout(deadline);
      reject(error);
    }
  });
};
