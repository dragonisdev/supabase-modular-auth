import { defineRailway, github, preserve, project, service } from "railway/iac";

const backend = service("@supabase-modular-auth/backend", {
  source: github("dragonisdev/supabase-modular-auth", {
    branch: "main",
    checkSuites: true,
  }),
  build: {
    builder: "RAILPACK",
    buildCommand:
      "pnpm run --filter=@supabase-modular-auth/types build && pnpm run --filter=@supabase-modular-auth/backend build",
    buildEnvironment: "V3",
    watchPatterns: [
      "/backend/**",
      "/types/**",
      "/package.json",
      "/pnpm-lock.yaml",
      "/pnpm-workspace.yaml",
    ],
  },
  start: "pnpm --filter @supabase-modular-auth/backend start",
  healthcheck: "/health",
  healthcheckTimeout: 30,
  replicas: { "europe-west4-drams3a": 1 },
  deploy: {
    sleepApplication: true,
    runtime: "V2",
    useLegacyStacker: false,
    ipv6EgressEnabled: false,
    limitOverride: {
      containers: {
        cpu: 2,
        memoryBytes: 4_000_000_000,
      },
    },
    restartPolicyType: "ON_FAILURE",
    restartPolicyMaxRetries: 10,
  },
  env: {
    AUTH_RATE_LIMIT_MAX_REQUESTS: preserve(),
    BACKEND_URL: preserve(),
    COOKIE_MAX_AGE_DAYS: preserve(),
    COOKIE_NAME: preserve(),
    COOKIE_SAME_SITE: preserve(),
    COOKIE_SECURE: preserve(),
    CSRF_COOKIE_SAME_SITE: preserve(),
    FRONTEND_URL: preserve(),
    LOCKOUT_DURATION_MS: preserve(),
    LOCKOUT_MAX_ATTEMPTS: preserve(),
    MAX_REQUEST_SIZE: preserve(),
    RATE_LIMIT_MAX_REQUESTS: preserve(),
    RATE_LIMIT_WINDOW_MS: preserve(),
    REDIS_CONNECT_TIMEOUT_MS: preserve(),
    REDIS_KEY_PREFIX: preserve(),
    REDIS_PING_INTERVAL_MS: preserve(),
    REDIS_REST_TIMEOUT_MS: preserve(),
    REDIS_TRANSPORT: preserve(),
    REQUEST_TIMEOUT_MS: preserve(),
    STRICT_RATE_LIMIT_MAX_REQUESTS: preserve(),
    SUPABASE_ANON_KEY: preserve(),
    SUPABASE_SERVICE_ROLE_KEY: preserve(),
    SUPABASE_URL: preserve(),
    TRUST_PROXY: preserve(),
    UPSTASH_REDIS_REST_TOKEN: preserve(),
    UPSTASH_REDIS_REST_URL: preserve(),
  },
});

export default defineRailway(() =>
  project("supabase-modular-auth", {
    resources: [backend],
  }),
);
