import { Response } from 'express';
import config from '../config/env.js';

export interface SuccessResponse {
  success: true;
  message: string;
  data?: unknown;
}

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAME_SITE,
    domain: config.COOKIE_DOMAIN,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: config.COOKIE_SAME_SITE,
    domain: config.COOKIE_DOMAIN,
    path: '/',
  });
};

export const successResponse = (
  res: Response,
  message: string,
  data?: unknown,
  statusCode: number = 200
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
