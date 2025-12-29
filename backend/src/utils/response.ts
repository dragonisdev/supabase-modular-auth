import { Response } from "express";
import config from "../config/env.js";

export interface SuccessResponse {
  success: true;
  message: string;
  data?: unknown;
}

/**
 * Get the cookie name with proper prefix for security
 * In production with HTTPS, uses __Host- prefix for maximum security:
 * - Cookie must be set with Secure flag
 * - Cookie must be set from a secure origin (HTTPS)
 * - Cookie must not have a Domain attribute
 * - Cookie path must be "/"
 */
const getCookieName = (): string => {
  // Use __Host- prefix only in production with secure cookies, which ensures it is only sent to the exact host
  if (config.NODE_ENV === "production" && config.COOKIE_SECURE) {
    return `__Host-${config.COOKIE_NAME}`;
  }
  return config.COOKIE_NAME;
};

/**
 * Cookie options builder
 * Constructs secure cookie options based on environment
 */
const getCookieOptions = (): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  domain?: string;
  maxAge: number;
  path: string;
} => {
  const options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "strict" | "lax" | "none";
    domain?: string;
    maxAge: number;
    path: string;
  } = {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: config.COOKIE_SECURE, // HTTPS only
    sameSite: config.COOKIE_SAME_SITE, // CSRF protection
    maxAge: config.COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000, // Convert days to ms
    path: "/",
  };

  // Only set domain if explicitly configured and not using __Host- prefix
  // __Host- prefix requires no domain attribute
  if (config.COOKIE_DOMAIN && !(config.NODE_ENV === "production" && config.COOKIE_SECURE)) {
    options.domain = config.COOKIE_DOMAIN;
  }

  return options;
};

/**
 * Set authentication cookie
 * Uses HttpOnly, Secure (in production), and SameSite attributes
 */
export const setAuthCookie = (res: Response, token: string): void => {
  const cookieName = getCookieName();
  const options = getCookieOptions();

  res.cookie(cookieName, token, options);
};

/**
 * Clear authentication cookie
 * Must use same options as when setting to properly clear
 */
export const clearAuthCookie = (res: Response): void => {
  const cookieName = getCookieName();
  const options = getCookieOptions();

  // Remove maxAge for clearing
  const { maxAge: _maxAge, ...clearOptions } = options;

  res.clearCookie(cookieName, clearOptions);

  // Also clear non-prefixed cookie in case of upgrade from old version
  if (cookieName !== config.COOKIE_NAME) {
    res.clearCookie(config.COOKIE_NAME, clearOptions);
  }
};

/**
 * Get the auth token from request cookies
 * Handles both prefixed and non-prefixed cookie names
 */
export const getAuthTokenFromCookies = (cookies: Record<string, string>): string | undefined => {
  const prefixedName = getCookieName();

  // Try prefixed name first, then fall back to non-prefixed
  return cookies[prefixedName] || cookies[config.COOKIE_NAME];
};

/**
 * Send a standardized success response
 */
export const successResponse = (
  res: Response,
  message: string,
  data?: unknown,
  statusCode: number = 200,
): Response => {
  const response: SuccessResponse = {
    success: true,
    message,
  };

  if (data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};
