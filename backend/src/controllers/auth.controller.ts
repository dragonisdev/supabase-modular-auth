import { Request, Response, NextFunction } from 'express';
import SupabaseService from '../services/supabase.service.js';
import lockoutService from '../services/lockout.service.js';
import { 
  registerSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from '../validators/auth.validator.js';
import { AuthError, EmailNotVerifiedError, ValidationError, ErrorCode } from '../utils/errors.js';
import { setAuthCookie, clearAuthCookie, successResponse } from '../utils/response.js';
import * as SecurityLogger from '../utils/logger.js';
import config from '../config/env.js';

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
        throw new ValidationError('Invalid registration data', validation.error);
      }

      const { email, password, username } = validation.data;
      const supabase = SupabaseService.getClient();

      // Register user with Supabase
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${config.FRONTEND_URL}/auth/verify`,
          data: {
            username: username,
          },
        },
      });

      if (error) {
        // Log detailed error information for debugging
        SecurityLogger.logRegistrationError(email, error as Error, req);
        
        // Handle specific error cases with user-friendly messages
        const errorMessage = error.message?.toLowerCase() || '';
        type SupabaseError = { code?: string; status?: number; name?: string; message?: string };
        const supaErrReg = error as SupabaseError;
        const errorCode = supaErrReg.code || '';
        const errorStatus = supaErrReg.status || 0;

        // Log error context securely (without full error object)
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Registration Error Analysis:', {
            errorCode,
            errorStatus,
            errorName: error.name,
            hasMessage: !!error.message
          });
        }

        // Connection/timeout errors
        if (error.name === 'AuthRetryableFetchError' || 
            errorMessage.includes('fetch failed') || 
            errorMessage.includes('timeout') ||
            errorCode === 'UND_ERR_CONNECT_TIMEOUT') {
          throw new AuthError(
            'Unable to connect to authentication service. Please check your internet connection and try again.',
            ErrorCode.CONNECTION_FAILED
          );
        }

        // Enhanced duplicate email detection
        if (errorCode === 'user_already_exists' || 
            errorCode === 'email_address_not_available' ||
            errorMessage.includes('already registered') ||
            errorMessage.includes('user already exists') ||
            errorMessage.includes('email already') ||
            errorMessage.includes('duplicate') ||
            (errorStatus === 422 && errorMessage.includes('email'))) {
          SecurityLogger.warn(`Duplicate registration attempt for email: ${email}`, { ip: req.ip });
          throw new AuthError(
            'This email is already registered. Please login instead or use the "Forgot Password" option if you need to reset your password.',
            ErrorCode.USER_EXISTS
          );
        }
        
        if (errorCode === 'email_address_invalid' || errorMessage.includes('email') && errorMessage.includes('invalid')) {
          throw new ValidationError('Please enter a valid email address.');
        }
        
        if (errorMessage.includes('password') && (errorMessage.includes('weak') || errorMessage.includes('short'))) {
          throw new ValidationError('Password is not strong enough. Please use a stronger password.');
        }

        if (errorCode === 'over_email_send_rate_limit') {
          throw new AuthError('Too many registration attempts. Please try again later.', ErrorCode.RATE_LIMITED);
        }

        // Service unavailable errors
        if (errorMessage.includes('service unavailable') || errorMessage.includes('502') || errorMessage.includes('503')) {
          throw new AuthError(
            'Authentication service is temporarily unavailable. Please try again in a few minutes.',
            ErrorCode.SERVICE_UNAVAILABLE
          );
        }
        
        // Generic fallback - don't expose internal error messages in production
        const publicMessage = process.env.NODE_ENV === 'development' 
          ? `Registration failed: ${error.message}. Please try again or contact support if the problem persists.`
          : 'Registration failed. Please try again or contact support if the problem persists.';
        
        throw new AuthError(publicMessage, ErrorCode.REGISTRATION_FAILED);
      }

      if (!data.user) {
        throw new AuthError('Registration failed');
      }

      // Log successful registration
      SecurityLogger.logRegistration(email, req);

      // Success - email verification required
      successResponse(
        res,
        'Registration successful. Please check your email to verify your account.',
        undefined,
        201
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
        throw new ValidationError('Invalid login data', validation.error);
      }

      const { email, password } = validation.data;

      // Check if account is locked
      if (lockoutService.isLocked(email)) {
        const remainingMinutes = lockoutService.getRemainingLockoutTime(email);
        SecurityLogger.logAccountLockout(email, req);
        throw new AuthError(
          `Account temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`
        );
      }

      const supabase = SupabaseService.getClient();

      // Attempt login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Log detailed error information for debugging
        SecurityLogger.logError(error as Error, req, { operation: 'login', email });
        
        const errorMessage = error.message?.toLowerCase() || '';
        const supaErrLogin = error as { code?: string };
        const errorCode = supaErrLogin.code || '';

        // Record failed attempt
        const shouldLock = lockoutService.recordFailedAttempt(email);
        SecurityLogger.logFailedLogin(email, req, errorMessage);

        // Monitor for suspicious patterns
        const failedAttempts = lockoutService.getFailedAttempts(email);
        if (failedAttempts >= 3) {
          SecurityLogger.logSecurityEvent('REPEATED_LOGIN_FAILURES', req, {
            email,
            attemptCount: failedAttempts,
            userAgent: req.get('User-Agent')
          });
        }

        if (shouldLock) {
          SecurityLogger.logAccountLockout(email, req);
          throw new AuthError('Too many failed attempts. Account locked for 15 minutes.');
        }

        // Connection/timeout errors
        if (error.name === 'AuthRetryableFetchError' || 
            errorMessage.includes('fetch failed') || 
            errorMessage.includes('timeout') ||
            errorCode === 'UND_ERR_CONNECT_TIMEOUT') {
          throw new AuthError(
            'Unable to connect to authentication service. Please check your internet connection and try again.',
            ErrorCode.CONNECTION_FAILED
          );
        }

        if (errorCode === 'email_not_confirmed' || errorMessage.includes('email') && errorMessage.includes('confirm')) {
          throw new EmailNotVerifiedError('Please verify your email before logging in. Check your inbox for the verification link.');
        }

        if (errorMessage.includes('user') && errorMessage.includes('banned')) {
          throw new AuthError('Your account has been suspended. Please contact support.');
        }

        if (errorMessage.includes('invalid') || errorMessage.includes('credentials')) {
          throw new AuthError('Invalid email or password.');
        }

        if (errorCode === 'too_many_requests' || errorMessage.includes('too many')) {
          throw new AuthError('Too many login attempts. Please try again later.', ErrorCode.RATE_LIMITED);
        }

        throw new AuthError(`Login failed: ${error.message || 'Unknown error occurred'}. Please try again or contact support if the problem persists.`);
      }

      if (!data.user || !data.session) {
        lockoutService.recordFailedAttempt(email);
        SecurityLogger.logFailedLogin(email, req, 'Invalid credentials');
        throw new AuthError('Invalid email or password.');
      }

      // Check if email is verified
      if (!data.user.email_confirmed_at) {
        throw new EmailNotVerifiedError();
      }

      // Clear failed attempts on successful login
      lockoutService.clearAttempts(email);
      SecurityLogger.logSuccessfulLogin(email, req);

      // Set auth cookie with access token
      setAuthCookie(res, data.session.access_token);

      successResponse(res, 'Login successful', {
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
      const token = req.cookies.auth_token;

      if (token) {
        const supabase = SupabaseService.getAdminClient();
        try {
          // Sign out from Supabase (requires admin client)
          await supabase.auth.admin.signOut(token);
        } catch (supabaseError) {
          // Log but don't fail - cookie will still be cleared
          console.error('Supabase logout error:', supabaseError);
        }
      }

      // Always clear cookie
      clearAuthCookie(res);

      successResponse(res, 'Logout successful');
    } catch (_error) {
      // Even if everything fails, try to clear the cookie
      clearAuthCookie(res);
      successResponse(res, 'Logout successful');
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
        throw new ValidationError('Invalid email', validation.error);
      }

      const { email } = validation.data;
      const supabase = SupabaseService.getClient();

      // Request password reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${config.FRONTEND_URL}/reset-password`,
      });

      if (error) {
        console.error('Supabase forgot password error:', error);
        // Still return success to prevent email enumeration, but log it
      }

      // Log password reset request
      SecurityLogger.logPasswordReset(email, req);

      // Always return success to prevent email enumeration
      successResponse(
        res,
        'If an account exists with this email, a password reset link has been sent.'
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
        throw new ValidationError('Invalid password', validation.error);
      }

      const { password, token } = validation.data;

      // First, verify the token and get the user using anon client
      const anonClient = SupabaseService.getClient();
      const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

      if (userError || !user) {
        console.error('Supabase get user error:', userError);
        throw new AuthError('Password reset link is invalid or expired. Please request a new one.');
      }

      // Now use admin client to update the password
      const adminClient = SupabaseService.getAdminClient();
      const { error } = await adminClient.auth.admin.updateUserById(
        user.id,
        { password }
      );

      if (error) {
        console.error('Supabase reset password error:', error);
        
        const errorMessage = error.message?.toLowerCase() || '';
        const supaErrReset = error as { code?: string };
        const errorCode = supaErrReset.code || '';

        if (errorCode === 'invalid_token' || errorMessage.includes('invalid') || errorMessage.includes('expired')) {
          throw new AuthError('Password reset link is invalid or expired. Please request a new one.');
        }

        if (errorMessage.includes('password') && (errorMessage.includes('weak') || errorMessage.includes('short'))) {
          throw new ValidationError('Password is not strong enough. Please use a stronger password.');
        }

        throw new AuthError('Password reset failed. Please try again.');
      }

      // Clear the token cookie
      clearAuthCookie(res);

      successResponse(res, 'Password reset successful. Please login with your new password.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/url
   * Get Google OAuth URL
   */
  async getGoogleAuthUrl(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supabase = SupabaseService.getClient();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${config.BACKEND_URL || 'http://localhost:3000'}/auth/google/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('OAuth URL generation error:', error);
        throw new AuthError('Failed to generate OAuth URL. Please try again later.');
      }

      if (!data.url) {
        throw new AuthError('OAuth provider not configured properly.');
      }

      successResponse(res, 'OAuth URL generated', { url: data.url });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/callback
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        throw new AuthError('Authorization code required');
      }

      const supabase = SupabaseService.getClient();

      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.session) {
        throw new AuthError('OAuth authentication failed');
      }

      // Set auth cookie
      setAuthCookie(res, data.session.access_token);

      // Redirect to frontend
      res.redirect(`${config.FRONTEND_URL}/dashboard`);
    } catch (_error) {
      // Redirect to frontend with error
      res.redirect(`${config.FRONTEND_URL}/auth/error`);
    }
  }

  /**
   * GET /auth/me
   * Get current user info (protected route)
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies.auth_token;

      if (!token) {
        throw new AuthError('Not authenticated. Please login.');
      }

      const supabase = SupabaseService.getClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error) {
        console.error('Get user error:', error);
        clearAuthCookie(res);
        
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
          throw new AuthError('Your session has expired. Please login again.');
        }
        
        throw new AuthError('Invalid session. Please login again.');
      }

      if (!user) {
        clearAuthCookie(res);
        throw new AuthError('User not found. Please login again.');
      }

      successResponse(res, 'User retrieved', {
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
