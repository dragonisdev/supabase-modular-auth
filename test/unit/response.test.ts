import { afterEach, describe, expect, it, vi } from "vitest";

import { createTestSession } from "../helpers/auth-fixtures.ts";

const createResponse = () => ({
  clearCookie: vi.fn(),
  cookie: vi.fn(),
});

describe("auth cookie helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stores access and refresh tokens in separate HttpOnly cookies", async () => {
    const { setAuthCookies } = await import("../../backend/src/utils/response.ts");
    const response = createResponse();
    const session = createTestSession({ expires_in: 3600 });

    setAuthCookies(response as unknown as Parameters<typeof setAuthCookies>[0], session);

    expect(response.cookie).toHaveBeenNthCalledWith(1, "auth_token", session.access_token, {
      httpOnly: true,
      maxAge: 3_600_000,
      path: "/",
      sameSite: "lax",
      secure: false,
    });
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      "auth_token_refresh",
      session.refresh_token,
      {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
        sameSite: "lax",
        secure: false,
      },
    );
  });

  it.each([30 * 24 * 60 * 60, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "caps or falls back to browser lifetime for expires_in=%s",
    async (expires_in) => {
      const { setAuthCookies } = await import("../../backend/src/utils/response.ts");
      const response = createResponse();

      setAuthCookies(
        response as unknown as Parameters<typeof setAuthCookies>[0],
        createTestSession({ expires_in }),
      );

      expect(response.cookie).toHaveBeenNthCalledWith(
        1,
        "auth_token",
        expect.any(String),
        expect.objectContaining({ maxAge: 7 * 24 * 60 * 60 * 1000 }),
      );
    },
  );

  it("reads and clears both browser-managed tokens", async () => {
    const { clearAuthCookies, getAuthTokenFromCookies, getRefreshTokenFromCookies } =
      await import("../../backend/src/utils/response.ts");
    const response = createResponse();

    expect(
      getAuthTokenFromCookies({
        auth_token: "access-value",
        auth_token_refresh: "refresh-value",
      }),
    ).toBe("access-value");
    expect(
      getRefreshTokenFromCookies({
        auth_token: "access-value",
        auth_token_refresh: "refresh-value",
      }),
    ).toBe("refresh-value");

    clearAuthCookies(response as unknown as Parameters<typeof clearAuthCookies>[0]);

    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(response.clearCookie).toHaveBeenCalledWith(
      "auth_token",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      "auth_token_refresh",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("uses host-only prefixed cookies in secure production mode", async () => {
    vi.stubEnv("BACKEND_URL", "https://app.example.com");
    vi.stubEnv("COOKIE_DOMAIN", ".example.com");
    vi.stubEnv("COOKIE_SECURE", "true");
    vi.stubEnv("FRONTEND_URL", "https://app.example.com");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REDIS_URL", "redis://127.0.0.1:6379");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    vi.resetModules();

    const { setAuthCookies, clearAuthCookies } =
      await import("../../backend/src/utils/response.ts");
    const response = createResponse();
    const session = createTestSession();

    setAuthCookies(response as unknown as Parameters<typeof setAuthCookies>[0], session);

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      "__Host-auth_token",
      session.access_token,
      expect.not.objectContaining({ domain: expect.anything() }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      "__Host-auth_token_refresh",
      session.refresh_token,
      expect.not.objectContaining({ domain: expect.anything() }),
    );
    expect(response.cookie).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ path: "/", secure: true }),
    );
    clearAuthCookies(response as unknown as Parameters<typeof clearAuthCookies>[0]);
    expect(response.clearCookie.mock.calls.map(([name]) => String(name)).toSorted()).toEqual([
      "__Host-auth_token",
      "__Host-auth_token_refresh",
      "auth_token",
      "auth_token_refresh",
    ]);
    for (const [, options] of response.clearCookie.mock.calls) {
      expect(options).toEqual({ httpOnly: true, path: "/", sameSite: "lax", secure: true });
    }
  });
});
