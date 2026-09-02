import type { SupabaseClient } from "@supabase/supabase-js";

import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "../../backend/src/app.ts";
import sessionService from "../../backend/src/services/session.service.ts";
import SupabaseService from "../../backend/src/services/supabase.service.ts";
import {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  ROTATED_ACCESS_TOKEN,
  createTestSession,
  createTestUser,
} from "../helpers/auth-fixtures.ts";
import { getCookiePair, getCookieValue, getSetCookies } from "../helpers/http.ts";

describe("Express security surface", () => {
  const app = new App().app;

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves health with request tracing, CORS, and hardened headers", async () => {
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://127.0.0.1:3001")
      .expect(200);

    expect(response.body).toMatchObject({ success: true, message: "OK" });
    expect(Date.parse(response.body.timestamp as string)).not.toBeNaN();
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3001");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("issues a readable strict CSRF cookie", async () => {
    const response = await request(app).get("/auth/csrf-token").expect(200);
    const csrfCookie = getSetCookies(response.headers).find((cookie) =>
      cookie.startsWith("csrf_token="),
    );

    expect(response.body).toEqual({ success: true, message: "CSRF token generated" });
    expect(csrfCookie).toContain("Max-Age=86400");
    expect(csrfCookie).toContain("Path=/");
    expect(csrfCookie).toContain("SameSite=Strict");
    expect(csrfCookie).not.toContain("HttpOnly");
  });

  it("rejects unsafe requests without a matching CSRF pair", async () => {
    const response = await request(app).post("/auth/logout").expect(403);

    expect(response.body).toEqual({
      error: "CSRF_TOKEN_MISSING",
      message: "CSRF token missing. Please refresh the page and try again.",
      success: false,
    });
  });

  it("accepts a matching CSRF pair and rotates the CSRF cookie", async () => {
    const tokenResponse = await request(app).get("/auth/csrf-token").expect(200);
    const initialCookie = getSetCookies(tokenResponse.headers).find((cookie) =>
      cookie.startsWith("csrf_token="),
    );
    expect(initialCookie).toBeTruthy();

    const cookiePair = getCookiePair(initialCookie!);
    const csrfToken = getCookieValue(cookiePair);
    const response = await request(app)
      .post("/auth/logout")
      .set("Cookie", cookiePair)
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    expect(response.body).toEqual({ success: true, message: "Logout successful" });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"SECURITY_LOGOUT_COMPLETED"'),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('"remoteRevocation":"not_attempted"'),
    );
    const rotatedCsrfCookie = getSetCookies(response.headers).find((cookie) =>
      cookie.startsWith("csrf_token="),
    );
    expect(rotatedCsrfCookie).toBeTruthy();
    expect(getCookiePair(rotatedCsrfCookie!)).not.toBe(cookiePair);
  });

  it("uses the implicit recovery flow for password reset emails", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    const createRecoveryClient = vi
      .spyOn(SupabaseService, "createRecoveryClient")
      .mockReturnValue({ auth: { resetPasswordForEmail } } as unknown as SupabaseClient);
    const tokenResponse = await request(app).get("/auth/csrf-token").expect(200);
    const csrfCookie = getSetCookies(tokenResponse.headers).find((cookie) =>
      cookie.startsWith("csrf_token="),
    );
    expect(csrfCookie).toBeTruthy();

    const cookiePair = getCookiePair(csrfCookie!);
    const csrfToken = getCookieValue(cookiePair);
    const response = await request(app)
      .post("/auth/forgot-password")
      .set("Cookie", cookiePair)
      .set("X-CSRF-Token", csrfToken)
      .send({ email: "user@example.com" })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: "If an account exists with this email, a password reset link has been sent.",
    });
    expect(createRecoveryClient).toHaveBeenCalledOnce();
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "http://127.0.0.1:3001/reset-password",
    });
  });

  it("returns a normalized JSON 404", async () => {
    const response = await request(app).get("/does-not-exist").expect(404);

    expect(response.body).toEqual({
      error: "INVALID_INPUT",
      message: "Route not found",
      success: false,
    });
  });

  it("resolves /auth/me once and emits rotated session cookies", async () => {
    const session = createTestSession();
    const user = createTestUser();
    const resolveSpy = vi.spyOn(sessionService, "resolve").mockResolvedValue({
      accessToken: ROTATED_ACCESS_TOKEN,
      refreshedSession: session,
      status: "authenticated",
      user,
    });

    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", [`auth_token=${ACCESS_TOKEN}`, `auth_token_refresh=${REFRESH_TOKEN}`])
      .expect(200);

    expect(resolveSpy).toHaveBeenCalledOnce();
    expect(resolveSpy).toHaveBeenCalledWith(ACCESS_TOKEN, REFRESH_TOKEN);
    expect(response.body.data.user).toMatchObject({
      email: user.email,
      id: user.id,
      username: "test-user",
    });
    const cookies = getSetCookies(response.headers);
    const accessCookie = cookies.find((cookie) => cookie.startsWith("auth_token="));
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("auth_token_refresh="));
    expect(accessCookie).toBeTruthy();
    expect(refreshCookie).toBeTruthy();
    expect(getCookieValue(getCookiePair(accessCookie!))).toBe(session.access_token);
    expect(getCookieValue(getCookiePair(refreshCookie!))).toBe(session.refresh_token);
  });

  it("returns 503 without deleting cookies when Supabase validation is transiently down", async () => {
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      error: Object.assign(new Error("fetch failed"), { status: 503 }),
      status: "unavailable",
    });

    const response = await request(app)
      .get("/auth/me")
      .set("Cookie", `auth_token=${ACCESS_TOKEN}`)
      .expect(503);

    expect(response.body).toMatchObject({ error: "SERVICE_UNAVAILABLE", success: false });
    const cookies = getSetCookies(response.headers);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^csrf_token=/);
    expect(cookies.some((cookie) => cookie.startsWith("auth_token="))).toBe(false);
    expect(cookies.some((cookie) => cookie.startsWith("auth_token_refresh="))).toBe(false);
  });
});
