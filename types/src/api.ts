// API Response Types
export interface ValidationErrorDetail {
  code: string;
  message: string;
  path: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  details?: ValidationErrorDetail[];
}

export const ErrorCode = {
  AUTH_FAILED: "AUTH_FAILED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  USER_EXISTS: "USER_EXISTS",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_INPUT: "INVALID_INPUT",
  RATE_LIMITED: "RATE_LIMITED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  REGISTRATION_FAILED: "REGISTRATION_FAILED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AuthUser {
  id: string;
  email: string;
  email_verified?: boolean;
  created_at?: string;
  username?: string | null;
}

export interface LoginResponseData {
  user: { id: string; email: string };
}

export interface GetMeResponseData {
  user: AuthUser;
}

export interface GoogleAuthUrlResponseData {
  url: string;
}
