import { type RedisReply } from "rate-limit-redis";
import { z } from "zod";

const redisValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const replySchema = z.union([
  z.object({ error: z.string() }),
  z.object({ result: z.union([redisValue, z.array(redisValue)]) }),
]);

export interface RedisRestOptions {
  url: string;
  token: string;
  timeoutMs: number;
}

const restError = (code: string): Error =>
  Object.assign(new Error("Redis REST command failed"), { code });

const normalizeRedisReply = (value: z.infer<typeof redisValue>): string | number | boolean =>
  value === null ? false : value;

// Upstash's REST endpoint accepts the same command arrays as node-redis.
export const sendRedisRestCommand = async (
  options: RedisRestOptions,
  args: string[],
): Promise<RedisReply> => {
  const response = await fetch(options.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(options.timeoutMs),
    redirect: "error",
    cache: "no-store",
  });

  // Redis command errors may use HTTP 400. Preserve only NOSCRIPT for the
  // store's script reload; never surface provider response bodies or credentials.
  if (!response.ok && response.status !== 400) {
    await response.body?.cancel();
    throw restError(`HTTP_${response.status}`);
  }
  const parsed = replySchema.safeParse(await response.json());
  if (!parsed.success) {
    throw restError("INVALID_RESPONSE");
  }
  const reply = parsed.data;
  if ("error" in reply) {
    if (response.status === 400 || response.ok) {
      if (/^NOSCRIPT(?:\s|$)/.test(reply.error)) {
        throw new Error("NOSCRIPT");
      }
    }
    throw restError("REDIS_COMMAND_ERROR");
  }
  if (!response.ok) {
    throw restError(`HTTP_${response.status}`);
  }
  return Array.isArray(reply.result)
    ? reply.result.map(normalizeRedisReply)
    : normalizeRedisReply(reply.result);
};
