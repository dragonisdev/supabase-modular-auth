import { Request, Response, NextFunction } from "express";
import { AuthError } from "../utils/errors.js";
import { clearAuthCookie, getAuthTokenFromCookies } from "../utils/response.js";
import SupabaseService from "../services/supabase.service.js";
import * as SecurityLogger from "../utils/logger.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    email_confirmed_at?: string;
  };
}

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
    const token = getAuthTokenFromCookies(req.cookies as Record<string, string>);

    if (!token) {
      SecurityLogger.logSecurityEvent("MISSING_AUTH_TOKEN", req);
      throw new AuthError("Authentication required");
    }

    // Basic token format validation before making API call
    if (typeof token !== "string" || token.length < 10) {
      clearAuthCookie(res);
      SecurityLogger.logSecurityEvent("MALFORMED_TOKEN", req);
      throw new AuthError("Invalid authentication token");
    }

    const supabase = SupabaseService.getClient();

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Clear invalid cookie
      clearAuthCookie(res);
      SecurityLogger.logSecurityEvent("INVALID_TOKEN_ATTEMPT", req, {
        errorType: error?.name || "no_user",
      });
      throw new AuthError("Invalid or expired session");
    }

    // Attach user to request for downstream handlers
    req.user = {
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
    };

    next();
  } catch (error) {
    if (error instanceof AuthError) {
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
    clearAuthCookie(res);
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
    const token = getAuthTokenFromCookies(req.cookies as Record<string, string>);

    if (!token) {
      // No token - continue without user
      next();
      return;
    }

    // Try to verify token
    const supabase = SupabaseService.getClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
      };
    } else {
      // Invalid token - clear it but don't fail
      clearAuthCookie(res);
    }

    next();
  } catch (_error) {
    // Any error - continue without user
    next();
  }
};
