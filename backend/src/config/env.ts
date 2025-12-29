import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  
  // Server
  PORT: z.string().regex(/^\d+$/).transform(Number).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // URLs
  BACKEND_URL: z.url().optional(),
  FRONTEND_URL: z.url(),
  
  // Cookies
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z.string().transform(val => val === 'true').default(false),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default(100), // General endpoints
  AUTH_RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default(5), // Auth endpoints
  STRICT_RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default(20), // Stricter for production
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;
try {
  config = envSchema.parse(process.env);
  // Production security checks
  if (config.NODE_ENV === 'production') {
    if (!config.COOKIE_SECURE) {
      console.warn('⚠️  WARNING: COOKIE_SECURE is false in production. This is insecure over HTTP.');
    }
    if (config.COOKIE_SAME_SITE !== 'strict' && config.COOKIE_SAME_SITE !== 'lax') {
      console.warn('⚠️  WARNING: COOKIE_SAME_SITE should be "strict" or "lax" in production.');
    }
  }
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Invalid environment variables:');
    error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  throw error;
}
export default config;
