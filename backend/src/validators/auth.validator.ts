import { z } from 'zod';
import zxcvbn from 'zxcvbn';
import xss from 'xss';

// Custom password strength validator
const strongPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine((password) => {
    const result = zxcvbn(password);
    return result.score >= 3; // Score 3-4 is strong
  }, {
    error: 'Password is too weak. Use a mix of letters, numbers, and symbols.',
  });

// Custom sanitized string validator
const sanitizedString = (min: number, max: number, pattern?: RegExp) => 
  z.string()
    .min(min)
    .max(max)
    .transform((val) => xss(val)) // Sanitize XSS
    .refine((val) => !pattern || pattern.test(val), {
      error: 'Invalid format',
    });

export const registerSchema = z.object({
  email: z.email('Invalid email format').transform((val) => xss(val)),
  username: sanitizedString(3, 30, /^[a-zA-Z0-9_-]+$/)
    .refine((val) => /^[a-zA-Z0-9_-]+$/.test(val), {
      error: 'Username can only contain letters, numbers, hyphens, and underscores',
    }),
  password: strongPassword,
});

export const loginSchema = z.object({
  email: z.email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  password: strongPassword,
  token: z.string().min(1, 'Reset token is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
