import type { User } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

import sessionService from "../services/session.service.js";
import { AppError, AuthError, ServiceUnavailableError } from "../utils/errors.js";
import * as SecurityLogger from "../utils/logger.js";
import {
  clearAuthCookies,
  getAuthTokenFromCookies,
  getRefreshTokenFromCookies,
  setAuthCookies,
} from "../utils/response.js";

export interface AuthenticatedRequest extends Request {
  auth?: {
    accessToken: string;
    refreshed: boolean;
  };
  user?: {
    id: string;
    email?: string;
    email_confirmed_at?: string;
    role?: string;
    is_admin?: boolean;
    banned?: boolean;
    ban_reason?: string | null;
    ban_expires_at?: string | null;
    created_at?: string;
    username?: string | null;
  };
}

const getBanState = (appMetadata: unknown): { banned: boolean; banExpiresAt: string | null } => {
  if (!appMetadata || typeof appMetadata !== "object") {
    return { banned: false, banExpiresAt: null };
  }

  const metadata = appMetadata as { banned?: unknown; ban_expires_at?: unknown };

  if (metadata.banned !== true) {
    return { banned: false, banExpiresAt: null };
  }

  const expiresAt = typeof metadata.ban_expires_at === "string" ? metadata.ban_expires_at : null;
  if (!expiresAt) {
    return { banned: true, banExpiresAt: null };
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return { banned: true, banExpiresAt: expiresAt };
  }

  return {
    banned: Date.now() < expiresAtMs,
    banExpiresAt: expiresAt,
  };
};

const getErrorType = (error: unknown): string => {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return "unknown";
  }

  return typeof error.name === "string" ? error.name : "unknown";
};

const toAuthenticatedUser = (
  user: User,
  banState: { banned: boolean; banExpiresAt: string | null },
): NonNullable<AuthenticatedRequest["user"]> => ({
  id: user.id,
  email: user.email,
  email_confirmed_at: user.email_confirmed_at,
  role: typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "user",
  is_admin:
    typeof user.app_metadata?.is_admin === "boolean"
      ? user.app_metadata.is_admin
      : user.app_metadata?.role === "admin",
  banned: banState.banned,
  ban_reason:
    typeof user.app_metadata?.ban_reason === "string" ? user.app_metadata.ban_reason : null,
  ban_expires_at: banState.banExpiresAt,
  created_at: user.created_at,
  username: typeof user.user_metadata?.username === "string" ? user.user_metadata.username : null,
});

/**
 * Authentication Middleware
 *
 * Verifies JWT token from HttpOnly cookie and attaches user to request.
 * Use for protected routes that require authentication.
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const cookies = (req.cookies || {}) as Record<string, string>;
    const accessToken = getAuthTokenFromCookies(cookies);
    const refreshToken = getRefreshTokenFromCookies(cookies);

    if (!accessToken && !refreshToken) {
      SecurityLogger.logSecurityEvent("MISSING_AUTH_TOKEN", req);
      throw new AuthError("Authentication required");
    }

    const resolution = await sessionService.resolve(accessToken, refreshToken);

    if (resolution.refreshedSession && resolution.status !== "invalid") {
      setAuthCookies(res, resolution.refreshedSession);
    }

    if (resolution.status === "unavailable") {
      SecurityLogger.logSecurityEvent("SESSION_VALIDATION_UNAVAILABLE", req, {
        errorType: getErrorType(resolution.error),
      });
      throw new ServiceUnavailableError();
    }

    if (resolution.status === "invalid") {
      clearAuthCookies(res);
      SecurityLogger.logSecurityEvent("INVALID_SESSION_ATTEMPT", req, {
        errorType: getErrorType(resolution.error),
      });
      throw new AuthError("Invalid or expired session");
    }

    const banState = getBanState(resolution.user.app_metadata);
    if (banState.banned) {
      clearAuthCookies(res);
      SecurityLogger.logSecurityEvent("BANNED_USER_REQUEST", req, {
        userId: resolution.user.id,
      });
      throw new AuthError("Your account has been banned. Please contact support.");
    }

    if (resolution.refreshedSession) {
      SecurityLogger.logSecurityEvent("SESSION_REFRESH_SUCCESS", req, {
        userId: resolution.user.id,
      });
    }

    req.auth = {
      accessToken: resolution.accessToken,
      refreshed: !!resolution.refreshedSession,
    };
    req.user = toAuthenticatedUser(resolution.user, banState);

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      SecurityLogger.logError(error as Error, req, { middleware: "authenticate" });
      next(new AuthError("Authentication failed"));
    }
  }
};

/**
 * Email Verification Middleware
 *
 * Requires that the authenticated user has verified their email.
 * Must be used after authenticate middleware.
 */
export const requireVerified = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    next(new AuthError("Authentication required"));
    return;
  }

  if (!req.user.email_confirmed_at) {
    clearAuthCookies(res);
    SecurityLogger.logSecurityEvent("UNVERIFIED_EMAIL_ACCESS", req, {
      userId: req.user.id,
    });
    next(new AuthError("Email verification required"));
    return;
  }

  next();
};

/**
 * Optional Authentication Middleware
 *
 * Attempts to authenticate but doesn't fail if no token is present.
 * Useful for routes that have different behavior for authenticated vs anonymous users.
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const cookies = (req.cookies || {}) as Record<string, string>;
    const accessToken = getAuthTokenFromCookies(cookies);
    const refreshToken = getRefreshTokenFromCookies(cookies);

    if (!accessToken && !refreshToken) {
      // No token - continue without user
      next();
      return;
    }

    const resolution = await sessionService.resolve(accessToken, refreshToken);

    if (resolution.refreshedSession && resolution.status !== "invalid") {
      setAuthCookies(res, resolution.refreshedSession);
    }

    if (resolution.status === "authenticated") {
      const banState = getBanState(resolution.user.app_metadata);
      if (banState.banned) {
        clearAuthCookies(res);
        next();
        return;
      }

      req.auth = {
        accessToken: resolution.accessToken,
        refreshed: !!resolution.refreshedSession,
      };
      req.user = toAuthenticatedUser(resolution.user, banState);
    } else if (resolution.status === "invalid") {
      // Invalid token - clear it but don't fail
      clearAuthCookies(res);
    }

    next();
  } catch (_error) {
    // Any error - continue without user
    next();
  }
};
