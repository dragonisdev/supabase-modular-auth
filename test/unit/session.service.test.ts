import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SessionService } from "../../backend/src/services/session.service.ts";
import SupabaseService from "../../backend/src/services/supabase.service.ts";
import {
  ACCESS_TOKEN,
  REFRESH_TOKEN,
  ROTATED_ACCESS_TOKEN,
  createTestSession,
  createTestUser,
} from "../helpers/auth-fixtures.ts";

const createClient = (auth: Record<string, unknown>): SupabaseClient =>
  ({ auth }) as unknown as SupabaseClient;

describe("SessionService", () => {
  it("accepts a remotely verified access token without refreshing", async () => {
    const user = createTestUser();
    const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const refreshSession = vi.fn();
    vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
      createClient({ getUser, refreshSession }),
    );

    const resolution = await new SessionService().resolve(ACCESS_TOKEN, REFRESH_TOKEN);

    expect(resolution).toEqual({
      accessToken: ACCESS_TOKEN,
      status: "authenticated",
      user,
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("rotates an expired access token and verifies the replacement token", async () => {
    const user = createTestUser();
    const session = createTestSession();
    const expiredGetUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "JWT expired", name: "AuthApiError", status: 401 },
    });
    const refreshSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const rotatedGetUser = vi.fn().mockResolvedValue({ data: { user }, error: null });

    vi.spyOn(SupabaseService, "createSessionClient")
      .mockReturnValueOnce(createClient({ getUser: expiredGetUser }))
      .mockReturnValueOnce(createClient({ getUser: rotatedGetUser, refreshSession }));

    const resolution = await new SessionService().resolve(ACCESS_TOKEN, REFRESH_TOKEN);

    expect(resolution).toEqual({
      accessToken: ROTATED_ACCESS_TOKEN,
      refreshedSession: session,
      status: "authenticated",
      user,
    });
    expect(refreshSession).toHaveBeenCalledWith({ refresh_token: REFRESH_TOKEN });
    expect(rotatedGetUser).toHaveBeenCalledWith(ROTATED_ACCESS_TOKEN);
  });

  it.each([
    [408, "unavailable"],
    [429, "unavailable"],
    [500, "unavailable"],
    [499, "invalid"],
    [401, "invalid"],
  ] as const)(
    "classifies HTTP %s without conflating retryable and terminal failures",
    async (status, expected) => {
      const error = { status };
      const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error });
      const refreshSession = vi.fn().mockResolvedValue({ data: { session: null }, error });
      vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
        createClient({ getUser, refreshSession }),
      );
      const service = new SessionService();

      expect((await service.resolve(ACCESS_TOKEN, REFRESH_TOKEN)).status).toBe(expected);
      expect(refreshSession).toHaveBeenCalledTimes(expected === "unavailable" ? 0 : 1);
      await expect(service.refresh(REFRESH_TOKEN)).resolves.toEqual({ status: expected, error });
    },
  );

  it.each([
    [new AuthRetryableFetchError("retry", 0), "unavailable"],
    [new TypeError("Failed to FETCH"), "unavailable"],
    [{ name: "TimeoutError" }, "unavailable"],
    [{ message: "NETWORK unavailable" }, "unavailable"],
    [{ message: "request TIMEOUT" }, "unavailable"],
    [{ message: "FETCH FAILED" }, "unavailable"],
    [new TypeError("invalid input"), "invalid"],
    [{ status: "503", name: 42, message: 42 }, "invalid"],
    ["unexpected rejection", "invalid"],
    [null, "invalid"],
  ] as const)("classifies thrown errors: %j", async (error, status) => {
    const getUser = vi.fn().mockRejectedValue(error);
    const refreshSession = vi.fn().mockRejectedValue(error);
    vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
      createClient({ getUser, refreshSession }),
    );
    const service = new SessionService();

    expect((await service.resolve(ACCESS_TOKEN, REFRESH_TOKEN)).status).toBe(status);
    expect(refreshSession).toHaveBeenCalledTimes(status === "unavailable" ? 0 : 1);
    await expect(service.refresh(REFRESH_TOKEN)).resolves.toEqual({ status, error });
  });

  it.each([
    [{ status: 503 }, null, "unavailable"],
    [{ status: 401 }, createTestUser(), "invalid"],
    [null, null, "invalid"],
  ] as const)(
    "requires independent verification after rotation: %j / %j",
    async (error, user, status) => {
      const session = createTestSession();
      const refreshSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
      const getUser = vi.fn().mockResolvedValue({ data: { user }, error });
      vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
        createClient({ getUser, refreshSession }),
      );

      await expect(new SessionService().refresh(REFRESH_TOKEN)).resolves.toEqual({
        error,
        refreshedSession: session,
        status,
      });
      expect(getUser).toHaveBeenCalledWith(session.access_token);
    },
  );

  it("rejects empty upstream results instead of authenticating or throwing", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: null });
    const refreshSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
      createClient({ getUser, refreshSession }),
    );
    const service = new SessionService();

    await expect(service.resolve(ACCESS_TOKEN, undefined)).resolves.toEqual({ status: "invalid" });
    await expect(service.refresh(REFRESH_TOKEN)).resolves.toEqual({ status: "invalid" });
  });

  it.each([0, 9, 10, 8192, 8193])(
    "enforces both token length boundaries at %i characters",
    async (length) => {
      const token = "x".repeat(length);
      const accepted = length === 10 || length === 8192;
      const user = createTestUser();
      const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
      const refreshSession = vi
        .fn()
        .mockResolvedValue({ data: { session: createTestSession() }, error: null });
      const clientSpy = vi
        .spyOn(SupabaseService, "createSessionClient")
        .mockReturnValue(createClient({ getUser, refreshSession }));
      const service = new SessionService();

      expect((await service.resolve(token, undefined)).status).toBe(
        accepted ? "authenticated" : "invalid",
      );
      expect((await service.resolve(undefined, token)).status).toBe(
        accepted ? "authenticated" : "invalid",
      );
      expect((await service.refresh(token)).status).toBe(accepted ? "authenticated" : "invalid");
      expect(clientSpy).toHaveBeenCalledTimes(accepted ? 3 : 0);
    },
  );
});
