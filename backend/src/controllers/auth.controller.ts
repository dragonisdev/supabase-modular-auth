import { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import SupabaseService from "../services/supabase.service.js";
import lockoutService from "../services/lockout.service.js";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator.js";
import { AuthError, EmailNotVerifiedError, ValidationError, ErrorCode } from "../utils/errors.js";
import {
  setAuthCookie,
  clearAuthCookie,
  successResponse,
  getAuthTokenFromCookies,
} from "../utils/response.js";
import * as SecurityLogger from "../utils/logger.js";
import config from "../config/env.js";

// OAuth state store (in production, use Redis or database)
const oauthStateStore = new Map<string, { expires: Date; ip?: string }>();

// Clean up expired OAuth states periodically
setInterval(() => {
  const now = new Date();
  for (const [state, data] of oauthStateStore.entries()) {
    if (data.expires < now) {
      oauthStateStore.delete(state);
    }
  }
}, 60000); // Every minute

/**
 * Generate a secure OAuth state parameter
 */
const generateOAuthState = (ip?: string): string => {
  const state = randomBytes(32).toString("base64url");
  oauthStateStore.set(state, {
    expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    ip,
  });
  return state;
};

/**
 * Validate OAuth state parameter
 */
const validateOAuthState = (state: string, _ip?: string): boolean => {
  const data = oauthStateStore.get(state);
  if (!data) {
    return false;
  }

  oauthStateStore.delete(state); // One-time use

  if (data.expires < new Date()) {
    return false;
  }

  // Optional: Verify IP matches (may cause issues with mobile networks)
  /*
  if (ip && data.ip && data.ip !== ip) {
    return false;
  }
  */

  return true;
};

export class AuthController {
  /**
   * POST /auth/register
   * Register a new user with email and password
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ValidationError("Invalid registration data", validation.error);
      }

      const { email, password, username } = validation.data;
      const clientIp = req.ip;

      // Check if IP is locked from too many registration attempts
      if (lockoutService.isLocked(`register:${email}`, clientIp)) {
        const remainingMinutes = lockoutService.getRemainingLockoutTime(
          `register:${email}`,
          clientIp,
        );
        throw new AuthError(
          `Too many registration attempts. Try again in ${remainingMinutes} minutes.`,
          ErrorCode.RATE_LIMITED,
        );
      }

      const supabase = SupabaseService.getClient();

      // Register user with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${config.FRONTEND_URL}/auth/verify`,
          data: username ? { username } : undefined,
        },
      });

      if (error) {
        // Record failed attempt for rate limiting
        lockoutService.recordFailedAttempt(`register:${email}`, clientIp);

        // Log error securely
        SecurityLogger.logRegistrationError(email, error as Error, req);

        // Handle specific error cases with user-friendly messages
        const errorMessage = error.message?.toLowerCase() || "";
        type SupabaseError = { code?: string; status?: number; name?: string; message?: string };
        const supaErr = error as SupabaseError;
        const errorCode = supaErr.code || "";

        // Connection/timeout errors
        if (
          error.name === "AuthRetryableFetchError" ||
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("timeout") ||
          errorCode === "UND_ERR_CONNECT_TIMEOUT"
        ) {
          throw new AuthError(
            "Unable to connect to authentication service. Please try again.",
            ErrorCode.CONNECTION_FAILED,
          );
        }

        // Enhanced duplicate email detection
        if (
          errorCode === "user_already_exists" ||
          errorCode === "email_address_not_available" ||
          errorMessage.includes("already registered") ||
          errorMessage.includes("user already exists") ||
          errorMessage.includes("email already") ||
          errorMessage.includes("duplicate")
        ) {
          SecurityLogger.warn(`Duplicate registration attempt`, { ip: clientIp });
          // Non-enumerating response - same as success
          successResponse(
            res,
            "Registration successful. Please check your email to verify your account.",
            undefined,
            201,
          );
          return;
        }

        if (errorCode === "email_address_invalid") {
          throw new ValidationError("Please enter a valid email address.");
        }

        if (errorCode === "over_email_send_rate_limit") {
          throw new AuthError(
            "Too many registration attempts. Please try again later.",
            ErrorCode.RATE_LIMITED,
          );
        }

        // Service unavailable errors
        if (
          errorMessage.includes("service unavailable") ||
          errorMessage.includes("502") ||
          errorMessage.includes("503")
        ) {
          throw new AuthError(
            "Authentication service is temporarily unavailable. Please try again.",
            ErrorCode.SERVICE_UNAVAILABLE,
          );
        }

        // Generic fallback
        throw new AuthError(
          "Registration failed. Please try again.",
          ErrorCode.REGISTRATION_FAILED,
        );
      }

      if (!data.user) {
        throw new AuthError("Registration failed");
      }

      // Clear rate limit on successful registration
      lockoutService.clearAttempts(`register:${email}`, clientIp);

      // Log successful registration
      SecurityLogger.logRegistration(email, req);

      // Success - email verification required
      successResponse(
        res,
        "Registration successful. Please check your email to verify your account.",
        undefined,
        201,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   * Login with email and password
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ValidationError("Invalid login data", validation.error);
      }

      const { email, password } = validation.data;
      const clientIp = req.ip;

      // Check if account is locked
      if (lockoutService.isLocked(email, clientIp)) {
        const remainingMinutes = lockoutService.getRemainingLockoutTime(email, clientIp);
        SecurityLogger.logAccountLockout(email, req);
        throw new AuthError(
          `Account temporarily locked. Try again in ${remainingMinutes} minutes.`,
          ErrorCode.RATE_LIMITED,
        );
      }

      const supabase = SupabaseService.getClient();

      // Attempt login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Log error securely
        SecurityLogger.logError(error as Error, req, { operation: "login" });

        const errorMessage = error.message?.toLowerCase() || "";
        const supaErr = error as { code?: string };
        const errorCode = supaErr.code || "";

        // Record failed attempt
        const shouldLock = lockoutService.recordFailedAttempt(email, clientIp);
        SecurityLogger.logFailedLogin(email, req, "Invalid credentials");

        // Monitor for suspicious patterns
        const status = lockoutService.getLockoutStatus(email, clientIp);
        if (status.failedAttempts >= 3) {
          SecurityLogger.logSecurityEvent("REPEATED_LOGIN_FAILURES", req, {
            attemptCount: status.failedAttempts,
            totalLockouts: status.totalLockouts,
          });
        }

        if (shouldLock) {
          SecurityLogger.logAccountLockout(email, req);
          throw new AuthError(
            "Too many failed attempts. Account locked for 15 minutes.",
            ErrorCode.RATE_LIMITED,
          );
        }

        // Connection/timeout errors
        if (
          error.name === "AuthRetryableFetchError" ||
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("timeout") ||
          errorCode === "UND_ERR_CONNECT_TIMEOUT"
        ) {
          throw new AuthError(
            "Unable to connect to authentication service. Please try again.",
            ErrorCode.CONNECTION_FAILED,
          );
        }

        if (
          errorCode === "email_not_confirmed" ||
          (errorMessage.includes("email") && errorMessage.includes("confirm"))
        ) {
          throw new EmailNotVerifiedError("Please verify your email before logging in.");
        }

        if (errorMessage.includes("banned")) {
          throw new AuthError("Your account has been suspended. Please contact support.");
        }

        if (errorCode === "too_many_requests") {
          throw new AuthError(
            "Too many login attempts. Please try again later.",
            ErrorCode.RATE_LIMITED,
          );
        }

        // Non-enumerating error for invalid credentials
        throw new AuthError("Invalid email or password.");
      }

      if (!data.user || !data.session) {
        lockoutService.recordFailedAttempt(email, clientIp);
        SecurityLogger.logFailedLogin(email, req, "No session returned");
        throw new AuthError("Invalid email or password.");
      }

      // Check if email is verified
      if (!data.user.email_confirmed_at) {
        throw new EmailNotVerifiedError();
      }

      // Clear failed attempts on successful login
      lockoutService.clearAttempts(email, clientIp);
      SecurityLogger.logSuccessfulLogin(email, req);

      // Set auth cookie with access token
      setAuthCookie(res, data.session.access_token);

      successResponse(res, "Login successful", {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout
   * Logout current user
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = getAuthTokenFromCookies(req.cookies as Record<string, string>);

      if (token) {
        try {
          // Sign out from Supabase using admin client
          const adminClient = SupabaseService.getAdminClient();
          await adminClient.auth.admin.signOut(token);
        } catch (supabaseError) {
          // Log but don't fail - cookie will still be cleared
          SecurityLogger.logError(supabaseError as Error, req, { operation: "logout" });
        }
      }

      // Always clear cookie
      clearAuthCookie(res);

      successResponse(res, "Logout successful");
    } catch (_error) {
      // Even if everything fails, try to clear the cookie
      clearAuthCookie(res);
      successResponse(res, "Logout successful");
    }
  }

  /**
   * POST /auth/forgot-password
   * Request password reset email
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input
      const validation = forgotPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ValidationError("Invalid email", validation.error);
      }

      const { email } = validation.data;
      const supabase = SupabaseService.getClient();

      // Request password reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${config.FRONTEND_URL}/reset-password`,
      });

      if (error) {
        // Log error but don't expose it to user
        SecurityLogger.logError(error as Error, req, { operation: "forgot-password" });
      }

      // Log password reset request
      SecurityLogger.logPasswordReset(email, req);

      // Always return success to prevent email enumeration
      successResponse(
        res,
        "If an account exists with this email, a password reset link has been sent.",
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   * Reset password using token from email
   */
  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate input
      const validation = resetPasswordSchema.safeParse(req.body);
      if (!validation.success) {
        throw new ValidationError("Invalid input", validation.error);
      }

      const { password, token } = validation.data;

      // Verify the token and get the user using anon client
      const anonClient = SupabaseService.getClient();
      const {
        data: { user },
        error: userError,
      } = await anonClient.auth.getUser(token);

      if (userError || !user) {
        SecurityLogger.logSecurityEvent("INVALID_RESET_TOKEN", req);
        throw new AuthError("Password reset link is invalid or expired. Please request a new one.");
      }

      // Use admin client to update the password
      const adminClient = SupabaseService.getAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(user.id, { password });

      if (error) {
        SecurityLogger.logError(error as Error, req, { operation: "reset-password" });

        const errorMessage = error.message?.toLowerCase() || "";
        const supaErr = error as { code?: string };
        const errorCode = supaErr.code || "";

        if (
          errorCode === "invalid_token" ||
          errorMessage.includes("invalid") ||
          errorMessage.includes("expired")
        ) {
          throw new AuthError(
            "Password reset link is invalid or expired. Please request a new one.",
          );
        }

        if (
          errorMessage.includes("password") &&
          (errorMessage.includes("weak") || errorMessage.includes("short"))
        ) {
          throw new ValidationError(
            "Password is not strong enough. Please use a stronger password.",
          );
        }

        throw new AuthError("Password reset failed. Please try again.");
      }

      // Reset lockout for this user on successful password change
      if (user.email) {
        lockoutService.fullReset(user.email);
      }

      // Clear the auth cookie
      clearAuthCookie(res);

      SecurityLogger.logSecurityEvent("PASSWORD_RESET_SUCCESS", req, { userId: user.id });

      successResponse(res, "Password reset successful. Please login with your new password.");
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/url
   * Get Google OAuth URL with CSRF protection via state parameter
   */
  async getGoogleAuthUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = SupabaseService.getClient();
      const state = generateOAuthState(req.ip);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${config.BACKEND_URL || `http://localhost:${config.PORT}`}/auth/google/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
            state, // CSRF protection
          },
        },
      });

      if (error) {
        SecurityLogger.logError(error as Error, req, { operation: "oauth-url" });
        throw new AuthError("Failed to generate OAuth URL. Please try again later.");
      }

      if (!data.url) {
        throw new AuthError("OAuth provider not configured properly.");
      }

      successResponse(res, "OAuth URL generated", { url: data.url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/callback
   * Handle Google OAuth callback with state validation
   */
  async handleGoogleCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const frontendErrorUrl = `${config.FRONTEND_URL}/auth/error`;

    try {
      const { code, state, error: oauthError } = req.query;

      // Handle OAuth errors from provider
      if (oauthError) {
        SecurityLogger.logSecurityEvent("OAUTH_ERROR", req, { error: oauthError });
        res.redirect(`${frontendErrorUrl}?error=oauth_denied`);
        return;
      }

      // Validate state parameter (CSRF protection)
      if (!state || typeof state !== "string" || !validateOAuthState(state, req.ip)) {
        SecurityLogger.logSecurityEvent("OAUTH_INVALID_STATE", req);
        res.redirect(`${frontendErrorUrl}?error=invalid_state`);
        return;
      }

      if (!code || typeof code !== "string") {
        SecurityLogger.logSecurityEvent("OAUTH_NO_CODE", req);
        res.redirect(`${frontendErrorUrl}?error=no_code`);
        return;
      }

      const supabase = SupabaseService.getClient();

      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.session) {
        SecurityLogger.logError((error as Error) || new Error("No session"), req, {
          operation: "oauth-callback",
        });
        res.redirect(`${frontendErrorUrl}?error=auth_failed`);
        return;
      }

      // Set auth cookie
      setAuthCookie(res, data.session.access_token);

      SecurityLogger.logSuccessfulLogin(data.user?.email || "oauth-user", req);

      // Redirect to frontend dashboard
      res.redirect(`${config.FRONTEND_URL}/dashboard`);
    } catch (error) {
      SecurityLogger.logError(error as Error, req, { operation: "oauth-callback" });
      res.redirect(frontendErrorUrl);
    }
  }

  /**
   * GET /auth/me
   * Get current user info (protected route)
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = getAuthTokenFromCookies(req.cookies as Record<string, string>);

      if (!token) {
        throw new AuthError("Not authenticated. Please login.");
      }

      const supabase = SupabaseService.getClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error) {
        SecurityLogger.logError(error as Error, req, { operation: "get-user" });
        clearAuthCookie(res);

        const errorMessage = error.message?.toLowerCase() || "";
        if (errorMessage.includes("expired") || errorMessage.includes("invalid")) {
          throw new AuthError("Your session has expired. Please login again.");
        }

        throw new AuthError("Invalid session. Please login again.");
      }

      if (!user) {
        clearAuthCookie(res);
        throw new AuthError("User not found. Please login again.");
      }

      successResponse(res, "User retrieved", {
        user: {
          id: user.id,
          email: user.email,
          email_verified: !!user.email_confirmed_at,
          created_at: user.created_at,
          username: user.user_metadata?.username || null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
