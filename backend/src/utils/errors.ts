export enum ErrorCode {
  AUTH_FAILED = "AUTH_FAILED",
  INVALID_INPUT = "INVALID_INPUT",
  EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  UNAUTHORIZED = "UNAUTHORIZED",
  CONNECTION_FAILED = "CONNECTION_FAILED",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  USER_EXISTS = "USER_EXISTS",
  RATE_LIMITED = "RATE_LIMITED",
  REGISTRATION_FAILED = "REGISTRATION_FAILED",
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    public message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthError extends AppError {
  constructor(
    message: string = "Authentication failed",
    code: ErrorCode = ErrorCode.AUTH_FAILED,
    details?: unknown,
  ) {
    super(401, code, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Invalid input", details?: unknown) {
    super(400, ErrorCode.INVALID_INPUT, message, details);
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(message: string = "Please verify your email to continue") {
    super(403, ErrorCode.EMAIL_NOT_VERIFIED, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, ErrorCode.UNAUTHORIZED, message);
  }
}
