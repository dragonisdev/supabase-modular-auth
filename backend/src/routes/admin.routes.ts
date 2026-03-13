import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";

import config from "../config/env.js";
import { AdminController } from "../controllers/admin.controller.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { authenticate } from "../middleware/auth.middleware.js";
import * as SecurityLogger from "../utils/logger.js";

const router = Router();
const adminController = new AdminController();

const getAdminRateLimitKey = (req: AuthenticatedRequest): string => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ipKey = ipKeyGenerator(ip);
  const userKey = req.user?.id || "anonymous";
  return `${userKey}:${ipKey}`;
};

const adminReadLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: Math.max(config.RATE_LIMIT_MAX_REQUESTS, config.AUTH_RATE_LIMIT_MAX_REQUESTS * 10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => getAdminRateLimitKey(req as AuthenticatedRequest),
  skip: (req) => req.method.toUpperCase() !== "GET",
  handler: (req, res) => {
    SecurityLogger.logSecurityEvent("ADMIN_READ_RATE_LIMIT_EXCEEDED", req, {
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many admin read requests. Please try again shortly.",
    });
  },
});

const adminWriteLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: Math.max(20, config.AUTH_RATE_LIMIT_MAX_REQUESTS * 4),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => getAdminRateLimitKey(req as AuthenticatedRequest),
  skip: (req) => req.method.toUpperCase() === "GET",
  handler: (req, res) => {
    SecurityLogger.logSecurityEvent("ADMIN_WRITE_RATE_LIMIT_EXCEEDED", req, {
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many admin write actions. Please try again later.",
    });
  },
});

router.use(authenticate, requireAdmin, adminReadLimiter, adminWriteLimiter);

router.get("/users", (req, res, next) => adminController.listUsers(req, res, next));
router.get("/users/:id", (req, res, next) => adminController.getUser(req, res, next));

router.post("/users/create", (req, res, next) => adminController.createUser(req, res, next));
router.post("/users/:id/update", (req, res, next) => adminController.updateUser(req, res, next));
router.post("/users/:id/delete", (req, res, next) => adminController.deleteUser(req, res, next));
router.post("/users/:id/ban", (req, res, next) => adminController.banUser(req, res, next));
router.post("/users/:id/unban", (req, res, next) => adminController.unbanUser(req, res, next));
router.post("/users/bulk", (req, res, next) => adminController.bulkAction(req, res, next));

router.get("/audit-logs", (req, res, next) => adminController.listAuditLogs(req, res, next));

export default router;
