import { RedisStore, type RedisReply } from "rate-limit-redis";
import { createClient } from "redis";

import config from "../config/env.js";
import { ServiceUnavailableError } from "../utils/errors.js";
import * as SecurityLogger from "../utils/logger.js";
import { sendRedisRestCommand, type RedisRestOptions } from "./redis-rest.js";

type RedisClient = ReturnType<typeof createClient>;

const MAX_RECONNECT_ATTEMPTS = 3;

// rate-limit-redis caches script-load promises. A rejected load must not leave
// this process permanently unavailable after Redis recovers.
class RecoverableRedisStore extends RedisStore {
  override async retryableIncrement(key: string): Promise<RedisReply> {
    await this.incrementScriptSha.catch(() => {
      this.incrementScriptSha = this.loadIncrementScript(this.prefixKey(key));
      return this.incrementScriptSha;
    });
    return super.retryableIncrement(key);
  }

  override async get(key: string) {
    await this.getScriptSha.catch(() => {
      this.getScriptSha = this.loadGetScript(this.prefixKey(key));
      return this.getScriptSha;
    });
    return super.get(key);
  }
}

const redisErrorReason = (error: Error): string => {
  if (error.name === "TimeoutError") {
    return "TIMEOUT";
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code) {
    return code;
  }

  if (/socket closed unexpectedly/i.test(error.message)) {
    return "SOCKET_CLOSED";
  }
  if (/timeout/i.test(error.message)) {
    return "TIMEOUT";
  }
  return "UNKNOWN";
};

export interface RateLimitStoreOptions {
  transport?: "tcp" | "rest";
  connectTimeoutMs: number;
  keyPrefix: string;
  pingIntervalMs?: number;
  redisUrl?: string;
  restUrl?: string;
  restToken?: string;
  restTimeoutMs?: number;
}

export class RateLimitStoreService {
  private readonly client: RedisClient | undefined;
  private readonly keyPrefix: string;
  private readonly rest: RedisRestOptions | undefined;

  constructor(options: RateLimitStoreOptions) {
    this.keyPrefix = options.keyPrefix;

    if (options.transport === "rest") {
      if (!options.restUrl || !options.restToken) {
        throw new Error("Redis REST requires a URL and token");
      }
      this.rest = {
        url: options.restUrl,
        token: options.restToken,
        timeoutMs: options.restTimeoutMs ?? 5000,
      };
      return;
    }

    if (!options.redisUrl) {
      this.client = undefined;
      return;
    }

    let hasConnected = false;
    this.client = createClient({
      url: options.redisUrl,
      disableOfflineQueue: true,
      pingInterval: options.pingIntervalMs,
      socket: {
        connectTimeout: options.connectTimeoutMs,
        keepAlive: true,
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
        reason: redisErrorReason(error),
      });
    });
  }

  public createStore(scope: string): RedisStore | undefined {
    if (!this.client && !this.rest) {
      return undefined;
    }

    return new RecoverableRedisStore({
      prefix: `${this.keyPrefix}${scope}:`,
      sendCommand: (...args: string[]) => this.sendCommand(args),
    });
  }

  public async connect(): Promise<void> {
    if (this.rest) {
      try {
        if ((await this.sendCommand(["PING"])) !== "PONG") {
          throw new Error("Unexpected Redis PING reply");
        }
        console.log("Rate limiting: shared Redis REST store connected");
      } catch {
        throw new ServiceUnavailableError("Rate limiting service failed to initialize");
      }
      return;
    }
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
    if (!this.rest && !this.client?.isReady) {
      throw new ServiceUnavailableError("Rate limiting service temporarily unavailable");
    }

    try {
      if (this.rest) {
        return await sendRedisRestCommand(this.rest, args);
      }
      return await this.client!.sendCommand(args);
    } catch (error) {
      if (error instanceof Error && /^NOSCRIPT(?:\s|$)/.test(error.message)) {
        throw error;
      }
      SecurityLogger.warn("Redis rate-limit store command failed", {
        transport: this.rest ? "rest" : "tcp",
        reason: error instanceof Error ? redisErrorReason(error) : "UNKNOWN",
      });
      throw new ServiceUnavailableError("Rate limiting service temporarily unavailable");
    }
  }
}

export const rateLimitStoreService: RateLimitStoreService = new RateLimitStoreService({
  transport: config.REDIS_TRANSPORT,
  connectTimeoutMs: config.REDIS_CONNECT_TIMEOUT_MS,
  keyPrefix: config.REDIS_KEY_PREFIX,
  pingIntervalMs: config.REDIS_PING_INTERVAL_MS,
  ...(config.REDIS_TCP_CONNECTION_URL ? { redisUrl: config.REDIS_TCP_CONNECTION_URL } : {}),
  ...(config.UPSTASH_REDIS_REST_URL ? { restUrl: config.UPSTASH_REDIS_REST_URL } : {}),
  ...(config.UPSTASH_REDIS_REST_TOKEN ? { restToken: config.UPSTASH_REDIS_REST_TOKEN } : {}),
  restTimeoutMs: config.REDIS_REST_TIMEOUT_MS,
});
