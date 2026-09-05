import {
  emailSchema,
  JWT_PATTERN,
  loginPasswordSchema,
  usernameSchema,
} from "@supabase-modular-auth/types";
import { z } from "zod";

import { strongPasswordSchema } from "./password.validator.js";

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
 * - Strong password requirements (zxcvbn score >= 3)
 * - Email format validation
 * - Username normalization and control-character rejection
 * - Input length limits to prevent DoS
 * - Regex pattern validation
 */

const safeEmail = emailSchema;

const loginPassword = loginPasswordSchema;

const safeUsername = usernameSchema;

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
 * - Email: required, normalized, lowercased
 * - Username: required, trimmed display name without control characters
 * - Password: required, strong (zxcvbn >= 3)
 */
export const registerSchema = z.object({
  email: safeEmail,
  username: safeUsername,
  password: strongPasswordSchema,
});

/**
 * Login Schema
 * - Email: required, basic format check
 * - Password: required, no strength validation (just format)
 */
export const loginSchema = z.object({
  email: safeEmail,
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
  password: strongPasswordSchema,
  token: resetToken,
});
