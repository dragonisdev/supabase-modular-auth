import type { RequestHandler } from "express";

import { randomUUID } from "crypto";

// Extend Express Request interface to include id
declare module "express-serve-static-core" {
  interface Request {
    id?: string;
  }
}

/**
 * Request ID Middleware
 * Generates a unique ID for each request for tracing and debugging
 */
export const requestIdMiddleware: RequestHandler = (req, res, next): void => {
  req.id = randomUUID();
  res.setHeader("X-Request-ID", req.id);
  next();
};
