import type { SupabaseClient } from "@supabase/supabase-js";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it("preserves the session when access-token verification is temporarily unavailable", async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "upstream unavailable", name: "AuthRetryableFetchError", status: 503 },
    });
    const createClientSpy = vi
      .spyOn(SupabaseService, "createSessionClient")
      .mockReturnValue(createClient({ getUser }));

    const resolution = await new SessionService().resolve(ACCESS_TOKEN, REFRESH_TOKEN);

    expect(resolution).toMatchObject({ status: "unavailable" });
    expect(createClientSpy).toHaveBeenCalledOnce();
  });

  it("classifies a rejected refresh token as terminally invalid", async () => {
    const refreshError = { message: "Invalid Refresh Token", name: "AuthApiError", status: 400 };
    const refreshSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: refreshError,
    });
    vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
      createClient({ refreshSession }),
    );

    const resolution = await new SessionService().resolve(undefined, REFRESH_TOKEN);

    expect(resolution).toEqual({ error: refreshError, status: "invalid" });
  });

  it("returns a rotated session when its verification fails transiently", async () => {
    const session = createTestSession();
    const verificationError = { message: "network timeout", name: "TimeoutError", status: 503 };
    const refreshSession = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: verificationError,
    });
    vi.spyOn(SupabaseService, "createSessionClient").mockReturnValue(
      createClient({ getUser, refreshSession }),
    );

    const resolution = await new SessionService().refresh(REFRESH_TOKEN);

    expect(resolution).toEqual({
      error: verificationError,
      refreshedSession: session,
      status: "unavailable",
    });
  });

  it("rejects missing and implausibly short tokens without creating a client", async () => {
    const createClientSpy = vi.spyOn(SupabaseService, "createSessionClient");

    await expect(new SessionService().resolve("short", "tiny")).resolves.toEqual({
      status: "invalid",
    });
    expect(createClientSpy).not.toHaveBeenCalled();
  });
});
