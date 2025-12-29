import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Server
  PORT: z.string().regex(/^\d+$/).transform(Number).optional().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // URLs
  BACKEND_URL: z.url().optional(),
  FRONTEND_URL: z.url(),

  // Cookies - use __Host- prefix in production for maximum security
  COOKIE_NAME: z.string().default("auth_token"),
  COOKIE_DOMAIN: z.string().optional(), // Only set for cross-subdomain cookies
  COOKIE_SECURE: z
    .string()
    .transform((val) => val === "true")
    .optional()
    .default(false),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
  COOKIE_MAX_AGE_DAYS: z.string().regex(/^\d+$/).transform(Number).optional().default(7),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).optional().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).optional().default(100), // General endpoints
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).optional().default(5), // Auth endpoints
  STRICT_RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .optional()
    .default(20), // Stricter for production

  // Security
  TRUST_PROXY: z
    .string()
    .transform((val) => {
      if (val === "true") {
        return true;
      }
      if (val === "false") {
        return false;
      }
      const num = parseInt(val, 10);
      return isNaN(num) ? 1 : num;
    })
    .optional()
    .default(1 as number | boolean),
  REQUEST_TIMEOUT_MS: z.string().regex(/^\d+$/).transform(Number).optional().default(30000), // 30 seconds
  MAX_REQUEST_SIZE: z.string().default("10kb"),

  // Lockout settings
  LOCKOUT_MAX_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).optional().default(5),
  LOCKOUT_DURATION_MS: z.string().regex(/^\d+$/).transform(Number).optional().default(900000), // 15 minutes
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;
try {
  config = envSchema.parse(process.env);

  // Production security checks
  if (config.NODE_ENV === "production") {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!config.COOKIE_SECURE) {
      errors.push("COOKIE_SECURE must be true in production (HTTPS required)");
    }

    if (config.COOKIE_SAME_SITE === "none") {
      warnings.push(
        'COOKIE_SAME_SITE is set to "none" - ensure this is intentional for cross-site requests',
      );
    }

    if (!config.BACKEND_URL) {
      warnings.push("BACKEND_URL is not set - OAuth callbacks may not work correctly");
    }

    if (config.TRUST_PROXY === false) {
      warnings.push(
        "TRUST_PROXY is false - rate limiting may not work correctly behind a reverse proxy",
      );
    }

    // Check for common development values in production
    if (config.FRONTEND_URL.includes("localhost")) {
      errors.push("FRONTEND_URL contains localhost in production");
    }

    if (config.SUPABASE_URL.includes("localhost")) {
      warnings.push("SUPABASE_URL contains localhost - is this intentional?");
    }

    // Log warnings
    warnings.forEach((w) => console.warn(`⚠️  WARNING: ${w}`));

    // Fail on errors in production
    if (errors.length > 0) {
      errors.forEach((e) => console.error(`❌ SECURITY ERROR: ${e}`));
      console.error("❌ Refusing to start with insecure configuration in production");
      process.exit(1);
    }
  }

  // Development info
  if (config.NODE_ENV === "development") {
    console.log("🔧 Development mode - some security features are relaxed");
  }
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:");
    error.issues.forEach((issue) => {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export default config;
