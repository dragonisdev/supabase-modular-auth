import { Request, Response, NextFunction } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import config from "../config/env.js";
import * as SecurityLogger from "../utils/logger.js";

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_LENGTH = 32;

const generateCsrfToken = (): string => {
  return randomBytes(TOKEN_LENGTH).toString("base64url");
};

const tokensMatch = (a: string, b: string): boolean => {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
};

const setCsrfCookie = (res: Response, token: string): void => {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
};

const EXCLUDED_ROUTES = ["/auth/google/callback", "/health"];

export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  const method = req.method.toUpperCase();
  const path = req.path;

  if (EXCLUDED_ROUTES.some((route) => path.startsWith(route))) {
    next();
    return;
  }

  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    const existingToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!existingToken) {
      const newToken = generateCsrfToken();
      setCsrfCookie(res, newToken);
    }
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    SecurityLogger.logSecurityEvent("CSRF_TOKEN_MISSING", req, {
      hasCookie: !!cookieToken,
      hasHeader: !!headerToken,
    });
    res.status(403).json({
      success: false,
      message: "CSRF token missing. Please refresh the page and try again.",
      error: "CSRF_TOKEN_MISSING",
    });
    return;
  }

  if (!tokensMatch(cookieToken, headerToken)) {
    SecurityLogger.logSecurityEvent("CSRF_TOKEN_MISMATCH", req);
    res.status(403).json({
      success: false,
      message: "CSRF token invalid. Please refresh the page and try again.",
      error: "CSRF_TOKEN_INVALID",
    });
    return;
  }

  const newToken = generateCsrfToken();
  setCsrfCookie(res, newToken);
  next();
};

export const getCsrfToken = (_req: Request, res: Response): void => {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({ success: true, message: "CSRF token generated" });
};
