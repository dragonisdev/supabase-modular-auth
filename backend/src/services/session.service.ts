import type { Session, User } from "@supabase/supabase-js";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import SupabaseService from "./supabase.service.js";

const MIN_TOKEN_LENGTH = 10;
const MAX_TOKEN_LENGTH = 8192;

export type SessionResolution =
  | {
      status: "authenticated";
      accessToken: string;
      user: User;
      refreshedSession?: Session;
    }
  | {
      status: "invalid";
      error?: unknown;
      refreshedSession?: Session;
    }
  | {
      status: "unavailable";
      error?: unknown;
      refreshedSession?: Session;
    };

const isTokenCandidate = (token: string | undefined): token is string =>
  typeof token === "string" && token.length >= MIN_TOKEN_LENGTH && token.length <= MAX_TOKEN_LENGTH;

const getNumericStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return undefined;
  }

  return typeof error.status === "number" ? error.status : undefined;
};

const isTransientAuthError = (error: unknown): boolean => {
  if (isAuthRetryableFetchError(error)) {
    return true;
  }

  const status = getNumericStatus(error);
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes("fetch")) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error && typeof error.name === "string" ? error.name.toLowerCase() : "";
  const message =
    "message" in error && typeof error.message === "string" ? error.message.toLowerCase() : "";

  return (
    name.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout")
  );
};

/**
 * Resolves a browser session without exposing either bearer token to the frontend.
 * Access tokens are verified against Supabase on every protected request. When an
 * access token can no longer be used, the rotating refresh token is exchanged on
 * a request-scoped client and the newly issued access token is verified again.
 */
export class SessionService {
  public async resolve(
    accessToken: string | undefined,
    refreshToken: string | undefined,
  ): Promise<SessionResolution> {
    if (isTokenCandidate(accessToken)) {
      try {
        const {
          data: { user },
          error,
        } = await SupabaseService.createSessionClient().auth.getUser(accessToken);

        if (!error && user) {
          return { status: "authenticated", accessToken, user };
        }

        if (error && isTransientAuthError(error)) {
          return { status: "unavailable", error };
        }
      } catch (error) {
        if (isTransientAuthError(error)) {
          return { status: "unavailable", error };
        }
      }
    }

    if (!isTokenCandidate(refreshToken)) {
      return { status: "invalid" };
    }

    return this.refresh(refreshToken);
  }

  /**
   * Exchange a refresh token for a new session, then independently verify the
   * rotated access token before returning an authenticated user.
   */
  public async refresh(refreshToken: string): Promise<SessionResolution> {
    if (!isTokenCandidate(refreshToken)) {
      return { status: "invalid" };
    }

    const client = SupabaseService.createSessionClient();

    try {
      const { data, error } = await client.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error) {
        return {
          status: isTransientAuthError(error) ? "unavailable" : "invalid",
          error,
        };
      }

      if (!data.session) {
        return { status: "invalid" };
      }

      const refreshedSession = data.session;
      const {
        data: { user },
        error: userError,
      } = await client.auth.getUser(refreshedSession.access_token);

      if (userError || !user) {
        return {
          status: userError && isTransientAuthError(userError) ? "unavailable" : "invalid",
          error: userError,
          refreshedSession,
        };
      }

      return {
        status: "authenticated",
        accessToken: refreshedSession.access_token,
        user,
        refreshedSession,
      };
    } catch (error) {
      return {
        status: isTransientAuthError(error) ? "unavailable" : "invalid",
        error,
      };
    }
  }
}

const sessionService = new SessionService();

export default sessionService;
