import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { z } from "zod";

const backendEnvFile = new URL("../../.env", import.meta.url);
if (existsSync(backendEnvFile)) {
  loadEnvFile(backendEnvFile);
}

const parseByteSize = (value: string): number => {
  const match = /^(\d+)(b|kb|mb)$/i.exec(value);
  if (!match) {
    return Number.NaN;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "mb" ? 1024 * 1024 : unit === "kb" ? 1024 : 1;
  return amount * multiplier;
};

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

  // CSRF Cookie (can differ from auth cookie for cross-site setups)
  CSRF_COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional().default("strict"),
  CSRF_COOKIE_SECURE: z
    .string()
    .transform((val) => val === "true")
    .optional(),

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
  REDIS_URL: z
    .url()
    .refine((value) => ["redis:", "rediss:"].includes(new URL(value).protocol), {
      message: "Must use the redis:// or rediss:// protocol",
    })
    .optional(),
  REDIS_KEY_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9:_-]+$/)
    .optional()
    .default("supabase-saas:rate-limit:"),
  REDIS_CONNECT_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((value) => value > 0, { message: "Must be greater than zero" })
    .optional()
    .default(5000),

  // Billing (optional until explicitly enabled)
  BILLING_ENABLED: z
    .string()
    .transform((value) => value === "true")
    .optional()
    .default(false),
  STRIPE_SECRET_KEY: z.string().trim().startsWith("sk_").min(16).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().trim().startsWith("whsec_").min(16).optional(),
  STRIPE_PRICE_IDS: z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((priceId) => priceId.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string().regex(/^price_[A-Za-z0-9]+$/))
        .max(20)
        .refine((priceIds) => new Set(priceIds).size === priceIds.length, {
          message: "Stripe Price IDs must be unique",
        }),
    )
    .optional()
    .default([]),
  STRIPE_WEBHOOK_MAX_SIZE: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => {
      const bytes = parseByteSize(value);
      return Number.isFinite(bytes) && bytes > 0 && bytes <= 1024 * 1024;
    }, "Must be a positive byte, kb, or mb value no larger than 1mb")
    .optional()
    .default("256kb"),

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

  if (
    config.BILLING_ENABLED &&
    (!config.STRIPE_SECRET_KEY ||
      !config.STRIPE_WEBHOOK_SECRET ||
      config.STRIPE_PRICE_IDS.length === 0)
  ) {
    console.error(
      "❌ BILLING_ENABLED requires STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_IDS",
    );
    process.exit(1);
  }

  // Production security checks
  if (config.NODE_ENV === "production") {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!config.COOKIE_SECURE) {
      errors.push("COOKIE_SECURE must be true in production (HTTPS required)");
    }

    if (config.CSRF_COOKIE_SECURE === false) {
      warnings.push("CSRF_COOKIE_SECURE is false in production; this may break Safari");
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

    if (!config.REDIS_URL) {
      errors.push("REDIS_URL is required in production for shared rate limiting");
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

  // Inherit CSRF cookie secure flag from auth cookie if not explicitly set
  if (config.CSRF_COOKIE_SECURE === undefined) {
    config.CSRF_COOKIE_SECURE = config.COOKIE_SECURE;
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
