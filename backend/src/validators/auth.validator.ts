import { z } from "zod";
import zxcvbn from "zxcvbn";
import xss from "xss";
import { AUTH_CONSTANTS, USERNAME_PATTERN, JWT_PATTERN } from "@supabase-modular-auth/types";

// Re-export types from shared package
export type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "@supabase-modular-auth/types";

/**
 * Authentication Input Validators
 *
 * Security features:
 * - XSS sanitization on user inputs
 * - Strong password requirements (zxcvbn score >= 3)
 * - Email format validation
 * - Username format restrictions
 * - Input length limits to prevent DoS
 * - Regex pattern validation
 */

// Sanitize string and prevent XSS
const sanitizeString = (val: string): string => {
  // XSS sanitization
  return xss(val.trim());
};

// Email validation with sanitization
const safeEmail = z
  .email("Invalid email format")
  .transform((val) => sanitizeString(val.toLowerCase()));

// Custom password strength validator (backend-specific with zxcvbn)
const strongPassword = z
  .string()
  .min(
    AUTH_CONSTANTS.MIN_PASSWORD_LENGTH,
    `Password must be at least ${AUTH_CONSTANTS.MIN_PASSWORD_LENGTH} characters`,
  )
  .refine(
    (password) => {
      const result = zxcvbn(password);
      return result.score >= 3; // Score 3-4 is strong
    },
    {
      message:
        "Password is too weak. Use a mix of letters, numbers, and symbols, and avoid common words.",
    },
  );

// Basic password validation for login (no strength check - just validate format)
const loginPassword = z.string().min(1, "Password is required");

// Username validation with strict pattern
const safeUsername = z
  .string()
  .min(AUTH_CONSTANTS.MIN_USERNAME_LENGTH, "Username must be at least 3 characters")
  .regex(USERNAME_PATTERN, "Username can only contain letters, numbers, hyphens, and underscores")
  .transform(sanitizeString);

// Reset token validation (JWT format check)
const resetToken = z
  .string()
  .min(10, "Invalid reset token")
  .max(2048, "Invalid reset token format")
  .refine(
    (token) => {
      return JWT_PATTERN.test(token);
    },
    {
      message: "Invalid reset token format",
    },
  );

/**
 * Registration Schema
 * - Email: required, sanitized, lowercased
 * - Username: optional, alphanumeric with underscores/hyphens
 * - Password: required, strong (zxcvbn >= 3)
 */
export const registerSchema = z.object({
  email: safeEmail,
  username: safeUsername.optional(),
  password: strongPassword,
});

/**
 * Login Schema
 * - Email: required, basic format check
 * - Password: required, no strength validation (just format)
 */
export const loginSchema = z.object({
  email: z
    .email("Invalid email format")
    .min(1, "Email is required")
    .transform((val) => val.toLowerCase().trim()),
  password: loginPassword,
});

/**
 * Forgot Password Schema
 * - Email: required, validated
 */
export const forgotPasswordSchema = z.object({
  email: safeEmail,
});

/**
 * Reset Password Schema
 * - Password: required, strong
 * - Token: required, JWT format
 */
export const resetPasswordSchema = z.object({
  password: strongPassword,
  token: resetToken,
});
