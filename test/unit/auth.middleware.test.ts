import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticate,
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("returns a retryable service error without clearing cookies", async () => {
    const request = createRequest({ auth_token: ACCESS_TOKEN, auth_token_refresh: REFRESH_TOKEN });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      error: Object.assign(new Error("fetch failed"), { status: 503 }),
      status: "unavailable",
    });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).not.toHaveBeenCalled();
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
    vi.spyOn(sessionService, "resolve").mockResolvedValue({ status: "invalid" });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({
      code: ErrorCode.AUTH_FAILED,
      statusCode: 401,
    });
  });

  it("blocks a banned user and clears the browser session", async () => {
    const request = createRequest({ auth_token: ACCESS_TOKEN });
    const response = createResponse();
    const next = vi.fn() as unknown as AuthenticateNext;
    vi.spyOn(sessionService, "resolve").mockResolvedValue({
      accessToken: ACCESS_TOKEN,
      status: "authenticated",
      user: createTestUser({ app_metadata: { banned: true } }),
    });

    await authenticate(request, response.value, next);

    expect(response.clearCookie).toHaveBeenCalledTimes(2);
    expect(request.user).toBeUndefined();
    expect(vi.mocked(next).mock.calls[0]?.[0]).toMatchObject({ statusCode: 401 });
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
});
