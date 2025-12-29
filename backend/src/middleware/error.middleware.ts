import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../utils/errors.js';
import * as SecurityLogger from '../utils/logger.js';

export interface ErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
  details?: unknown;
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Use enhanced logging for all errors
  SecurityLogger.logError(err, req, { 
    middleware: 'errorHandler',
    isAppError: err instanceof AppError 
  });

  // Development: show error details (but not in logs that could be stored)
  if (process.env.NODE_ENV === 'development') {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Error:', err.name);
    console.error('📝 Message:', err.message);
    if (err instanceof AppError) {
      console.error('🔖 Code:', err.code);
      console.error('🔢 Status:', err.statusCode);
      // Only show details if they don't contain sensitive info
      if (err.details && !JSON.stringify(err.details).toLowerCase().includes('password')) {
        console.error('📋 Details:', JSON.stringify(err.details, null, 2));
      }
    }
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Handle known AppErrors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      error: err.code,
      message: err.message,
    };

    // Only include details in development
    if (process.env.NODE_ENV === 'development' && err.details) {
      response.details = err.details;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unexpected errors - don't leak information
  const response: ErrorResponse = {
    success: false,
    error: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  };

  res.status(500).json(response);
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  const response: ErrorResponse = {
    success: false,
    error: ErrorCode.INVALID_INPUT,
    message: 'Route not found',
  };
  res.status(404).json(response);
};
