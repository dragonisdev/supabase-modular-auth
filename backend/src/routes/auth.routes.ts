import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { getCsrfToken } from "../middleware/csrf.middleware.js";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import config from "../config/env.js";
import * as SecurityLogger from "../utils/logger.js";

const router = Router();
const authController = new AuthController();

/**
 * Per-IP rate limiter for auth endpoints (stricter limits)
 *
 * Prevents brute force attacks on authentication endpoints
 * - 5 attempts per 15 minutes by default
 * - Configurable via AUTH_RATE_LIMIT_MAX_REQUESTS env var
 */
const authLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Each IP address gets its own limit
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return ipKeyGenerator(ip);
  },
  skip: () => false,
  handler: (req, res) => {
    SecurityLogger.logSecurityEvent("AUTH_RATE_LIMIT_EXCEEDED", req, {
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again later.",
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60),
    });
  },
});

/**
 * Stricter rate limiter for sensitive endpoints (forgot-password, reset-password)
 * Even fewer attempts allowed to prevent abuse
 */
const sensitiveAuthLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: Math.max(3, Math.floor(config.AUTH_RATE_LIMIT_MAX_REQUESTS / 2)), // Half the normal limit, min 3
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return ipKeyGenerator(ip);
  },
  handler: (req, res) => {
    SecurityLogger.logSecurityEvent("SENSITIVE_AUTH_RATE_LIMIT_EXCEEDED", req, {
      path: req.path,
      method: req.method,
    });
    res.status(429).json({
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many attempts. Please try again later.",
      retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000 / 60),
    });
  },
});

// CSRF TOKEN ENDPOINT

/**
 * GET /auth/csrf-token
 * Get a fresh CSRF token (for SPA initialization)
 */
router.get("/csrf-token", getCsrfToken);

// PUBLIC ROUTES (with rate limiting)

/**
 * POST /auth/register
 * Register a new user with email and password
 */
router.post("/register", authLimiter, (req, res, next) => authController.register(req, res, next));

/**
 * POST /auth/login
 * Login with email and password
 */
router.post("/login", authLimiter, (req, res, next) => authController.login(req, res, next));

/**
 * POST /auth/logout
 * Logout the current user (no rate limit - should always work)
 */
router.post("/logout", (req, res) => authController.logout(req, res));

/**
 * POST /auth/forgot-password
 * Request a password reset email
 * Uses stricter rate limiting to prevent email enumeration/spam
 */
router.post("/forgot-password", sensitiveAuthLimiter, (req, res, next) =>
  authController.forgotPassword(req, res, next),
);

/**
 * POST /auth/reset-password
 * Reset password using token from email
 * Uses stricter rate limiting
 */
router.post("/reset-password", sensitiveAuthLimiter, (req, res, next) =>
  authController.resetPassword(req, res, next),
);

// OAUTH ROUTES

/**
 * GET /auth/google/url
 * Get the Google OAuth authorization URL
 */
router.get("/google/url", authLimiter, (req, res, next) =>
  authController.getGoogleAuthUrl(req, res, next),
);

/**
 * GET /auth/google/callback
 * Handle Google OAuth callback (called by Google, not frontend)
 * No rate limit - Google controls the flow
 */
router.get("/google/callback", (req, res, next) =>
  authController.handleGoogleCallback(req, res, next),
);

// PROTECTED ROUTES (require authentication)

/**
 * GET /auth/me
 * Get current user info
 * Protected - requires valid auth cookie
 */
router.get("/me", authenticate, (req, res, next) => authController.getCurrentUser(req, res, next));

export default router;
