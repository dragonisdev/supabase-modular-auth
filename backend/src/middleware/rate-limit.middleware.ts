import { rateLimit, type Options, type RateLimitRequestHandler } from "express-rate-limit";

import {
  rateLimitStoreService,
  type RateLimitStoreService,
} from "../services/rate-limit.service.js";

type RateLimiterOptions = Omit<Partial<Options>, "passOnStoreError" | "store">;

export const createRateLimiter = (
  scope: string,
  options: RateLimiterOptions,
  storeService: Pick<RateLimitStoreService, "createStore"> = rateLimitStoreService,
): RateLimitRequestHandler => {
  const store = storeService.createStore(scope);

  return rateLimit({
    ...options,
    ...(store ? { store } : {}),
    // Security controls must not silently disappear during a Redis outage.
    passOnStoreError: false,
  });
};
