import type { Session } from "@supabase/supabase-js";
import type { CookieOptions, Response } from "express";

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
const REFRESH_COOKIE_SUFFIX = "_refresh";

const getCookieName = (baseName: string): string => {
  // Use __Host- prefix only in production with secure cookies, which ensures it is only sent to the exact host
  if (config.NODE_ENV === "production" && config.COOKIE_SECURE) {
    return `__Host-${baseName}`;
  }
  return baseName;
};

const getAccessCookieName = (): string => getCookieName(config.COOKIE_NAME);
const getRefreshCookieName = (): string =>
  getCookieName(`${config.COOKIE_NAME}${REFRESH_COOKIE_SUFFIX}`);

const getSessionMaxAge = (): number => config.COOKIE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Cookie options builder
 * Constructs secure cookie options based on environment
 */
const getCookieOptions = (maxAge: number): CookieOptions => {
  const options: CookieOptions = {
    httpOnly: true, // Prevents JavaScript access (XSS protection)
    secure: config.COOKIE_SECURE, // HTTPS only
    sameSite: config.COOKIE_SAME_SITE, // CSRF protection
    maxAge,
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
 * Set access and refresh cookies from a Supabase session.
 * The access cookie follows the JWT lifetime; the rotating refresh cookie
 * follows the configured browser-session lifetime.
 */
export const setAuthCookies = (
  res: Response,
  session: Pick<Session, "access_token" | "refresh_token" | "expires_in">,
): void => {
  const sessionMaxAge = getSessionMaxAge();
  const accessMaxAge =
    Number.isFinite(session.expires_in) && session.expires_in > 0
      ? Math.min(session.expires_in * 1000, sessionMaxAge)
      : sessionMaxAge;

  res.cookie(getAccessCookieName(), session.access_token, getCookieOptions(accessMaxAge));
  res.cookie(getRefreshCookieName(), session.refresh_token, getCookieOptions(sessionMaxAge));
};

/**
 * Clear access and refresh cookies.
 * Must use the same security options as when setting them.
 */
export const clearAuthCookies = (res: Response): void => {
  const options = getCookieOptions(getSessionMaxAge());

  // Remove maxAge for clearing
  const { maxAge: _maxAge, ...clearOptions } = options;

  const baseNames = [config.COOKIE_NAME, `${config.COOKIE_NAME}${REFRESH_COOKIE_SUFFIX}`];
  for (const baseName of baseNames) {
    const cookieName = getCookieName(baseName);
    res.clearCookie(cookieName, clearOptions);

    // Also clear non-prefixed cookies in case of an upgrade from an older version.
    if (cookieName !== baseName) {
      res.clearCookie(baseName, clearOptions);
    }
  }
};

/**
 * Get the auth token from request cookies
 * Handles both prefixed and non-prefixed cookie names
 */
export const getAuthTokenFromCookies = (cookies: Record<string, string>): string | undefined => {
  const prefixedName = getAccessCookieName();

  // Try prefixed name first, then fall back to non-prefixed
  return cookies[prefixedName] || cookies[config.COOKIE_NAME];
};

/**
 * Get the rotating refresh token from request cookies.
 */
export const getRefreshTokenFromCookies = (cookies: Record<string, string>): string | undefined => {
  const baseName = `${config.COOKIE_NAME}${REFRESH_COOKIE_SUFFIX}`;
  const prefixedName = getRefreshCookieName();

  return cookies[prefixedName] || cookies[baseName];
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
