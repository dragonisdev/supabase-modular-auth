import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testEnvironment = {
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

export default defineConfig({
  resolve: {
    alias: {
      "@supabase-modular-auth/types": fileURLToPath(
        new URL("./types/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      exclude: ["test/**"],
      include: [
        "backend/src/middleware/auth.middleware.ts",
        "backend/src/services/session.service.ts",
        "backend/src/utils/response.ts",
        "frontend/lib/api.ts",
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 55,
        functions: 55,
        lines: 60,
        statements: 60,
      },
    },
    env: testEnvironment,
    include: ["test/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
    setupFiles: ["./test/setup.ts"],
    testTimeout: 10_000,
  },
});
