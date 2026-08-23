import { afterEach, vi } from "vitest";

const requiredTestEnvironment = {
  BACKEND_URL: "http://127.0.0.1:3000",
  COOKIE_MAX_AGE_DAYS: "7",
  COOKIE_NAME: "auth_token",
  COOKIE_SAME_SITE: "lax",
  COOKIE_SECURE: "false",
  DOTENV_CONFIG_QUIET: "true",
  FRONTEND_URL: "http://127.0.0.1:3001",
  NODE_ENV: "test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_URL: "http://127.0.0.1:54321",
} as const;

for (const [name, value] of Object.entries(requiredTestEnvironment)) {
  process.env[name] ??= value;
}

afterEach(() => {
  vi.unstubAllGlobals();
});
