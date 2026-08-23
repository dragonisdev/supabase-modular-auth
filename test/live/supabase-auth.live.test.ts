import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const explicitlyEnabled = process.env.RUN_LIVE_SUPABASE_TESTS === "true";

const isLocalUrl = (() => {
  if (!url) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
})();

const remoteAllowed = process.env.ALLOW_REMOTE_SUPABASE_TESTS === "true";
const canRun =
  explicitlyEnabled && !!url && !!anonKey && !!serviceRoleKey && (isLocalUrl || remoteAllowed);
const describeLive = canRun ? describe : describe.skip;
const liveUrl = url ?? "http://127.0.0.1:54321";
const liveAnonKey = anonKey ?? "disabled-live-anon-key";
const liveServiceRoleKey = serviceRoleKey ?? "disabled-live-service-role-key";

describeLive("live Supabase session rotation", () => {
  const admin = createClient(liveUrl, liveServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const anon = createClient(liveUrl, liveAnonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const email = `codex-auth-test-${randomUUID()}@example.invalid`;
  const password = `Live-test-${randomUUID()}-Aa1!`;
  let userId: string | undefined;

  afterAll(async () => {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("signs in, verifies, and rotates a session", async () => {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    expect(created.error).toBeNull();
    userId = created.data.user?.id;
    expect(userId).toBeTruthy();

    const signedIn = await anon.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session).toBeTruthy();

    const originalSession = signedIn.data.session!;
    const verified = await anon.auth.getUser(originalSession.access_token);
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(userId);

    const refreshed = await anon.auth.refreshSession({
      refresh_token: originalSession.refresh_token,
    });
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.access_token).toBeTruthy();
    expect(refreshed.data.session?.refresh_token).toBeTruthy();
  });
});
