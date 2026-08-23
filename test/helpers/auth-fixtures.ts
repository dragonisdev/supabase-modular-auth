import type { Session, User } from "@supabase/supabase-js";

export const ACCESS_TOKEN = "test-access-token-that-is-long-enough";
export const REFRESH_TOKEN = "test-refresh-token-that-is-long-enough";
export const ROTATED_ACCESS_TOKEN = "rotated-access-token-that-is-long-enough";
export const ROTATED_REFRESH_TOKEN = "rotated-refresh-token-that-is-long-enough";

export const createTestUser = (overrides: Partial<User> = {}): User => ({
  app_metadata: { role: "user", is_admin: false },
  aud: "authenticated",
  created_at: "2026-08-23T10:00:00.000Z",
  email: "user@example.com",
  email_confirmed_at: "2026-08-23T10:01:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  role: "authenticated",
  updated_at: "2026-08-23T10:01:00.000Z",
  user_metadata: { username: "test-user" },
  ...overrides,
});

export const createTestSession = (overrides: Partial<Session> = {}): Session => ({
  access_token: ROTATED_ACCESS_TOKEN,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  refresh_token: ROTATED_REFRESH_TOKEN,
  token_type: "bearer",
  user: createTestUser(),
  ...overrides,
});
