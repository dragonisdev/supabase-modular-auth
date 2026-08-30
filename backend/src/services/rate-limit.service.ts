import { RedisStore, type RedisReply } from "rate-limit-redis";
import { createClient } from "redis";

import config from "../config/env.js";
import { ServiceUnavailableError } from "../utils/errors.js";
import * as SecurityLogger from "../utils/logger.js";

type RedisClient = ReturnType<typeof createClient>;

const MAX_RECONNECT_ATTEMPTS = 3;

export interface RateLimitStoreOptions {
  connectTimeoutMs: number;
  keyPrefix: string;
  redisUrl?: string;
}

export class RateLimitStoreService {
  private readonly client: RedisClient | undefined;
  private readonly keyPrefix: string;

  constructor(options: RateLimitStoreOptions) {
    this.keyPrefix = options.keyPrefix;

    if (!options.redisUrl) {
      this.client = undefined;
      return;
    }

    let hasConnected = false;
    this.client = createClient({
      url: options.redisUrl,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: options.connectTimeoutMs,
        reconnectStrategy: (retries) => {
          if (!hasConnected && retries >= MAX_RECONNECT_ATTEMPTS) {
            return new Error("Redis rate-limit store reconnect limit reached");
          }

          return Math.min(100 * 2 ** Math.min(retries, 5), 3000);
        },
      },
    });

    this.client.on("ready", () => {
      hasConnected = true;
    });

    this.client.on("error", (error: Error) => {
      const code = (error as NodeJS.ErrnoException).code;
      SecurityLogger.warn("Redis rate-limit store connection error", {
        errorName: error.name,
        ...(code ? { code } : {}),
      });
    });
  }

  public createStore(scope: string): RedisStore | undefined {
    if (!this.client) {
      return undefined;
    }

    return new RedisStore({
      prefix: `${this.keyPrefix}${scope}:`,
      sendCommand: (...args: string[]) => this.sendCommand(args),
    });
  }

  public async connect(): Promise<void> {
    if (!this.client || this.client.isReady) {
      return;
    }

    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }
      await this.client.ping();
      console.log("Rate limiting: shared Redis store connected");
    } catch {
      if (this.client.isOpen) {
        this.client.destroy();
      }
      throw new ServiceUnavailableError("Rate limiting service failed to initialize");
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    if (this.client.isOpen) {
      await this.client.close();
    }
  }

  private async sendCommand(args: string[]): Promise<RedisReply> {
    if (!this.client?.isReady) {
      throw new ServiceUnavailableError("Rate limiting service temporarily unavailable");
    }

    try {
      return await this.client.sendCommand(args);
    } catch {
      throw new ServiceUnavailableError("Rate limiting service temporarily unavailable");
    }
  }
}

export const rateLimitStoreService: RateLimitStoreService = new RateLimitStoreService({
  connectTimeoutMs: config.REDIS_CONNECT_TIMEOUT_MS,
  keyPrefix: config.REDIS_KEY_PREFIX,
  ...(config.REDIS_URL ? { redisUrl: config.REDIS_URL } : {}),
});
