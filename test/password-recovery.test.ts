import type { NextFunction, Request, Response } from "express";

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.FRONTEND_URL = "http://localhost:3001";
process.env.BACKEND_URL = "http://localhost:3001";
process.env.NODE_ENV = "test";
process.env.COOKIE_SECURE = "false";

const { AuthController } = await import("../backend/src/controllers/auth.controller.js");
const { ErrorCode } = await import("../backend/src/utils/errors.js");
const SecurityLogger = await import("../backend/src/utils/logger.js");
const SupabaseService = (await import("../backend/src/services/supabase.service.js")).default;

interface CookieCall {
  name: string;
  options?: Record<string, unknown>;
  value?: string;
}

const originalCreateSessionClient = SupabaseService.createSessionClient.bind(SupabaseService);
const originalGetAdminClient = SupabaseService.getAdminClient.bind(SupabaseService);
const originalGetClient = SupabaseService.getClient.bind(SupabaseService);

afterEach(() => {
  SupabaseService.createSessionClient = originalCreateSessionClient;
  SupabaseService.getAdminClient = originalGetAdminClient;
  SupabaseService.getClient = originalGetClient;
});

function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    cookies: {},
    get: () => undefined,
    id: "test-request-id",
    ip: "127.0.0.1",
    method: "GET",
    originalUrl: "/auth/recovery/confirm",
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createResponse(): {
  cookies: CookieCall[];
  clearedCookies: CookieCall[];
  jsonBody: unknown;
  redirectStatus?: number;
  redirectUrl?: string;
  response: Response;
  statusCode?: number;
} {
  const state: {
    cookies: CookieCall[];
    clearedCookies: CookieCall[];
    jsonBody: unknown;
    redirectStatus?: number;
    redirectUrl?: string;
    response: Response;
    statusCode?: number;
  } = {
    cookies: [],
    clearedCookies: [],
    jsonBody: undefined,
    response: undefined as unknown as Response,
  };

  const response = {
    clearCookie(name: string, options?: Record<string, unknown>) {
      state.clearedCookies.push({ name, options });
      return response;
    },
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      state.cookies.push({ name, value, options });
      return response;
    },
    json(body: unknown) {
      state.jsonBody = body;
      return response;
    },
    redirect(status: number, url: string) {
      state.redirectStatus = status;
      state.redirectUrl = url;
      return response;
    },
    status(statusCode: number) {
      state.statusCode = statusCode;
      return response;
    },
  } as unknown as Response;

  state.response = response;
  return state;
}

void test("forgot password directs Supabase to the backend-owned recovery callback", async () => {
  let resetRequest: unknown;
  SupabaseService.getClient = () =>
    ({
      auth: {
        resetPasswordForEmail: async (email: string, options: unknown) => {
          resetRequest = { email, options };
          return { error: null };
        },
      },
    }) as never;

  const request = createRequest({
    body: { email: "person@example.com" },
    method: "POST",
    originalUrl: "/auth/forgot-password",
  });
  const result = createResponse();
  let nextError: unknown;
  const next = ((error?: unknown) => {
    nextError = error;
  }) as NextFunction;

  await new AuthController().forgotPassword(request, result.response, next);

  assert.equal(nextError, undefined);
  assert.deepEqual(resetRequest, {
    email: "person@example.com",
    options: { redirectTo: "http://localhost:3001/auth/recovery/confirm" },
  });
  assert.equal(
    result.clearedCookies.some(({ name }) => name === "auth_token_password_recovery"),
    true,
  );
});

void test("recovery confirmation exchanges a token hash for an HttpOnly recovery cookie", async () => {
  let verificationInput: unknown;
  SupabaseService.createSessionClient = () =>
    ({
      auth: {
        verifyOtp: async (input: unknown) => {
          verificationInput = input;
          return {
            data: {
              session: {
                access_token: "recovery.access.token",
                expires_in: 3600,
              },
              user: { id: "user-1" },
            },
            error: null,
          };
        },
      },
    }) as never;

  const request = createRequest({
    query: { token_hash: "valid-token-hash", type: "recovery" },
  });
  const result = createResponse();

  await new AuthController().confirmPasswordRecovery(request, result.response);

  assert.deepEqual(verificationInput, {
    token_hash: "valid-token-hash",
    type: "recovery",
  });
  assert.equal(result.cookies.length, 1);
  assert.equal(result.cookies[0]?.name, "auth_token_password_recovery");
  assert.equal(result.cookies[0]?.value, "recovery.access.token");
  assert.equal(result.cookies[0]?.options?.httpOnly, true);
  assert.equal(result.cookies[0]?.options?.maxAge, 15 * 60 * 1000);
  assert.equal(result.redirectStatus, 303);
  assert.equal(result.redirectUrl, "http://localhost:3001/reset-password?recovery=verified");
  assert.equal(result.redirectUrl?.includes("recovery.access.token"), false);
});

void test("invalid recovery confirmation never calls Supabase and redirects safely", async () => {
  let called = false;
  SupabaseService.createSessionClient = () => {
    called = true;
    return {} as never;
  };

  const request = createRequest({ query: { type: "recovery" } });
  const result = createResponse();

  await new AuthController().confirmPasswordRecovery(request, result.response);

  assert.equal(called, false);
  assert.equal(result.redirectStatus, 303);
  assert.equal(result.redirectUrl, "http://localhost:3001/reset-password?error=invalid_or_expired");
  assert.equal(
    result.clearedCookies.some(({ name }) => name === "auth_token_password_recovery"),
    true,
  );
});

void test("retryable recovery verification failures preserve the link for another attempt", async () => {
  SupabaseService.createSessionClient = () =>
    ({
      auth: {
        verifyOtp: async () => ({
          data: { session: null, user: null },
          error: Object.assign(new Error("temporarily unavailable"), { status: 503 }),
        }),
      },
    }) as never;

  const request = createRequest({
    query: { token_hash: "valid-token-hash", type: "recovery" },
  });
  const result = createResponse();

  await new AuthController().confirmPasswordRecovery(request, result.response);

  assert.equal(result.redirectStatus, 303);
  assert.equal(
    result.redirectUrl,
    "http://localhost:3001/reset-password?error=service_unavailable",
  );
  assert.equal(result.clearedCookies.length, 0);
});

void test("error logging omits recovery hashes from request URLs", () => {
  const request = createRequest({
    originalUrl: "/auth/recovery/confirm?token_hash=secret-recovery-hash&type=recovery",
    path: "/auth/recovery/confirm",
  });
  const originalConsoleError = console.error;
  let logged = "";

  try {
    console.error = (...values: unknown[]) => {
      logged += values.map(String).join(" ");
    };
    SecurityLogger.logError(new Error("temporary failure"), request);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(logged.includes("secret-recovery-hash"), false);
  assert.equal(logged.includes("/auth/recovery/confirm"), true);
});

void test("password reset validates the recovery cookie and clears every local credential", async () => {
  let updatedUser: unknown;
  SupabaseService.createSessionClient = () =>
    ({
      auth: {
        getUser: async (token: string) => ({
          data: { user: { id: "user-1", email: "person@example.com" } },
          error: token === "recovery.access.token" ? null : new Error("unexpected token"),
        }),
      },
    }) as never;
  SupabaseService.getAdminClient = () =>
    ({
      auth: {
        admin: {
          updateUserById: async (userId: string, attributes: unknown) => {
            updatedUser = { userId, attributes };
            return { error: null };
          },
        },
      },
    }) as never;

  const request = createRequest({
    body: { password: "vC9!zR2#qL8@wT4$" },
    cookies: { auth_token_password_recovery: "recovery.access.token" },
    method: "POST",
    originalUrl: "/auth/reset-password",
  });
  const result = createResponse();
  let nextError: unknown;
  const next = ((error?: unknown) => {
    nextError = error;
  }) as NextFunction;

  await new AuthController().resetPassword(request, result.response, next);

  assert.equal(nextError, undefined);
  assert.deepEqual(updatedUser, {
    userId: "user-1",
    attributes: { password: "vC9!zR2#qL8@wT4$" },
  });
  assert.deepEqual(result.jsonBody, {
    success: true,
    message: "Password reset successful. Please login with your new password.",
  });
  assert.equal(
    result.clearedCookies.some(({ name }) => name === "auth_token_password_recovery"),
    true,
  );
  assert.equal(
    result.clearedCookies.some(({ name }) => name === "auth_token"),
    true,
  );
  assert.equal(
    result.clearedCookies.some(({ name }) => name === "auth_token_refresh"),
    true,
  );
});

void test("password reset rejects requests without the HttpOnly recovery cookie", async () => {
  const request = createRequest({
    body: { password: "vC9!zR2#qL8@wT4$" },
    method: "POST",
    originalUrl: "/auth/reset-password",
  });
  const result = createResponse();
  let nextError: unknown;
  const next = ((error?: unknown) => {
    nextError = error;
  }) as NextFunction;

  await new AuthController().resetPassword(request, result.response, next);

  assert.equal((nextError as { code?: string })?.code, ErrorCode.INVALID_TOKEN);
  assert.equal((nextError as { statusCode?: number })?.statusCode, 401);
});
