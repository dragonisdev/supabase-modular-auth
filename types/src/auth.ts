import { z } from "zod";

// Constants
export const AUTH_CONSTANTS = {
  MIN_PASSWORD_LENGTH: 8,
  MIN_USERNAME_LENGTH: 3,
} as const;

// Validation Patterns
export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

// Base Validators
export const emailSchema = z
  .email("Invalid email format")
  .transform((val) => val.toLowerCase().trim());

export const strongPasswordSchema = z
  .string()
  .min(AUTH_CONSTANTS.MIN_PASSWORD_LENGTH, "Password must be at least 8 characters");

export const loginPasswordSchema = z.string().min(1, "Password is required");

export const usernameSchema = z
  .string()
  .min(AUTH_CONSTANTS.MIN_USERNAME_LENGTH, "Username must be at least 3 characters")
  .regex(USERNAME_PATTERN, "Username can only contain letters, numbers, hyphens, and underscores");

export const resetTokenSchema = z
  .string()
  .min(10, "Invalid reset token")
  .max(2048, "Invalid reset token format")
  .refine((token) => JWT_PATTERN.test(token), { message: "Invalid reset token format" });

// Form Schemas
export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema.optional(),
  password: strongPasswordSchema,
});

export const loginSchema = z.object({
  email: z
    .email("Invalid email format")
    .min(1, "Email is required")
    .transform((val) => val.toLowerCase().trim()),
  password: loginPasswordSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: strongPasswordSchema,
  token: resetTokenSchema,
});

// Client-Side Schemas
export const registerFormSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema.optional().or(z.literal("")),
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const resetPasswordFormSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    token: resetTokenSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// Type Exports
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;
