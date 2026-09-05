import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticate,
  optionalAuthenticate,
  requireVerified,
  type AuthenticatedRequest,
} from "../../backend/src/middleware/auth.middleware.ts";
import sessionService from "../../backend/src/services/session.service.ts";
import { ErrorCode } from "../../backend/src/utils/errors.ts";
import {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  ROTATED_ACCESS_TOKEN,
  createTestSession,
  createTestUser,
} from "../helpers/auth-fixtures.ts";

const createRequest = (cookies: Record<string, string>): AuthenticatedRequest =>
  ({
    cookies,
    get: vi.fn(),
  }) as unknown as AuthenticatedRequest;

type AuthenticateResponse = Parameters<typeof authenticate>[1];
type AuthenticateNext = Parameters<typeof authenticate>[2];

const createResponse = () => {
  const clearCookie = vi.fn();
  const cookie = vi.fn();

  return {
    clearCookie,
    cookie,
    value: { clearCookie, cookie } as unknown as AuthenticateResponse,
  };
};

describe("authenticate middleware", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("attaches the verified user and rotates both cookies", async () => {
    const request = createRequest({
      auth_token: ACCESS_TOKEN,
      auth_token_refresh: REFRESH_TOKEN,
    });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    const user = createTestUser();
    const session = createTestSession();
    const resolveSpy = vi.spyOn(sessionService, "resolve").mockResolvedValue({
      accessToken: ROTATED_ACCESS_TOKEN,
      refreshedSession: session,
      status: "authenticated",
      user,
    });

    await authenticate(request, response.value, next);

    expect(resolveSpy).toHaveBeenCalledWith(ACCESS_TOKEN, REFRESH_TOKEN);
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(request.auth).toEqual({ accessToken: ROTATED_ACCESS_TOKEN, refreshed: true });
    expect(request.user).toMatchObject({
      email: user.email,
      id: user.id,
      is_admin: false,
      role: "user",
      username: "test-user",
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("persists rotated tokens even when their verification is temporarily unavailable", async () => {
    const request = createRequest({ auth_token: ACCESS_TOKEN, auth_token_refresh: REFRESH_TOKEN });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      error: Object.assign(new Error("fetch failed"), { status: 503 }),
      refreshedSession: createTestSession(),
      status: "unavailable",
    });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).not.toHaveBeenCalled();
    expect(response.cookie).toHaveBeenCalledWith(
      "auth_token",
      ROTATED_ACCESS_TOKEN,
      expect.any(Object),
    );
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(request.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      statusCode: 503,
    });
  });

  it("clears both cookies after a terminal session failure", async () => {
    const request = createRequest({ auth_token: ACCESS_TOKEN, auth_token_refresh: REFRESH_TOKEN });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      status: "invalid",
      refreshedSession: createTestSession(),
    });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(response.cookie).not.toHaveBeenCalled();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
      code: ErrorCode.AUTH_FAILED,
      statusCode: 401,
    });
  });

  it.each([
    [undefined, true],
    ["invalid-date", true],
    ["2026-01-01T00:00:00.001Z", true],
    ["2026-01-01T00:00:00.000Z", false],
    ["2025-12-31T23:59:59.999Z", false],
  ])("enforces ban expiry at %s", async (expiresAt, banned) => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-01T00:00:00.000Z"));
    const request = createRequest({ auth_token: ACCESS_TOKEN });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      status: "authenticated",
      user: createTestUser({ app_metadata: { banned: true, ban_expires_at: expiresAt } }),
    });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).toHaveBeenCalledTimes(banned ? 2 : 0);
    expect(next).toHaveBeenCalledWith(
      ...(banned ? [expect.objectContaining({ statusCode: 401 })] : []),
    );
    expect(request.user?.id).toBe(banned ? undefined : createTestUser().id);
  });

  it("does not call Supabase resolution when neither cookie exists", async () => {
    const request = createRequest({});
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    const resolveSpy = vi.spyOn(sessionService, "resolve");

    await authenticate(request, response.value, next);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
  });

  it.each([undefined, "", "2026-01-01T00:00:00Z"])(
    "requires a verified email: %s",
    (confirmedAt) => {
      const request = createRequest({});
      const response = createResponse();
      const next = vi.fn();
      request.user = { id: "user", email_confirmed_at: confirmedAt };

      requireVerified(request, response.value, next);

      expect(next).toHaveBeenCalledExactlyOnceWith(
        ...(confirmedAt ? [] : [expect.objectContaining({ statusCode: 401 })]),
      );
      expect(response.clearCookie).toHaveBeenCalledTimes(confirmedAt ? 0 : 2);
    },
  );

  it.each([
    ["authenticated", false, true, 0],
    ["authenticated", true, false, 2],
    ["unavailable", false, false, 0],
    ["invalid", false, false, 2],
  ] as const)(
    "optional auth handles %s / banned=%s without blocking the request",
    async (status, banned, attached, cleared) => {
      const request = createRequest({ auth_token_refresh: REFRESH_TOKEN });
      const response = createResponse();
      const next = vi.fn();
      vi.spyOn(sessionService, "resolve").mockResolvedValue({
        status,
        accessToken: ROTATED_ACCESS_TOKEN,
        refreshedSession: createTestSession(),
        user: createTestUser({ app_metadata: { banned } }),
      });

      await optionalAuthenticate(request, response.value, next);

      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(request.user?.id).toBe(attached ? createTestUser().id : undefined);
      expect(request.auth).toEqual(
        attached ? { accessToken: ROTATED_ACCESS_TOKEN, refreshed: true } : undefined,
      );
      expect(response.clearCookie).toHaveBeenCalledTimes(cleared);
      expect(response.cookie).toHaveBeenCalledTimes(status === "invalid" ? 0 : 2);
    },
  );
});
