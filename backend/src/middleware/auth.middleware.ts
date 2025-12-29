import { Request, Response, NextFunction } from 'express';
import { AuthError } from '../utils/errors.js';
import SupabaseService from '../services/supabase.service.js';
import * as SecurityLogger from '../utils/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    email_confirmed_at?: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.auth_token;

    if (!token) {
      SecurityLogger.logSecurityEvent('MISSING_AUTH_TOKEN', req);
      throw new AuthError('No authentication token provided');
    }

    const supabase = SupabaseService.getClient();
    
    // Verify the JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // Clear invalid cookie
      res.clearCookie('auth_token');
      SecurityLogger.logSecurityEvent('INVALID_TOKEN_ATTEMPT', req, {
        hasError: !!error,
        hasUser: !!user
      });
      throw new AuthError('Invalid or expired token');
    }

    // Attach user to request
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
      next(new AuthError('Authentication failed'));
    }
  }
};

export const requireVerified = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.email_confirmed_at) {
    res.clearCookie('auth_token');
    next(new AuthError('Email verification required'));
    return;
  }
  next();
};
