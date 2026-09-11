import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  getErrorMessage,
  initCsrf,
  parseFieldErrors,
  isSessionUnavailable,
} from "../../frontend/lib/api.ts";

const jsonResponse = (body: unknown, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
};

describe("frontend API client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([undefined, { cookie: "theme=light" }])(
    "omits CSRF headers when no token is available: %j",
    async (document) => {
      vi.stubGlobal("document", document);
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
      vi.stubGlobal("fetch", fetchMock);
      await api.logout();
      expect(fetchMock.mock.calls[0]?.[1].headers).not.toHaveProperty("X-CSRF-Token");
      expect(fetchMock.mock.calls[0]?.[1].credentials).toBe("include");
    },
  );

  it("initializes CSRF with credentials and tolerates network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(initCsrf()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/auth/csrf-token", { credentials: "include" });
  });

  it("uses the configured backend origin and encodes admin search values", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com");
    vi.resetModules();
    const { api: remote } = await import("../../frontend/lib/api.ts");
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await remote.admin.listUsers();
    await remote.admin.listUsers({ search: "Ada & Bob", filterBanned: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.com/admin/users");
    const url = new URL(fetchMock.mock.calls[1]?.[0]);
    expect([...url.searchParams.entries()]).toEqual([
      ["search", "Ada & Bob"],
      ["filterBanned", "false"],
    ]);
  });

  it.each([
    [403, "FORBIDDEN"],
    [429, "RATE_LIMITED"],
    [200, "SERVICE_UNAVAILABLE"],
  ] as const)(
    "preserves fallback meaning for invalid response shape at HTTP %i",
    async (status, error) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ unexpected: true }, { status })),
      );
      await expect(api.getMe()).resolves.toMatchObject({ success: false, error });
    },
  );

  it("keeps the first field error and routes pathless errors to general", () => {
    expect(parseFieldErrors()).toEqual({});
    expect(parseFieldErrors([])).toEqual({});
    const details = [
      { path: ["email"], message: "Invalid address", code: "invalid_format" },
      { path: ["email"], message: "Second error", code: "custom" },
      { path: [], message: "Try again", code: "custom" },
    ];
    expect(parseFieldErrors(details)).toEqual({ email: "Invalid address", general: "Try again" });
    expect(getErrorMessage({ success: false, message: "", details })).toBe(
      "Invalid address. Second error. Try again",
    );
  });

  it.each([
    ["AUTH_FAILED", "Invalid email or password."],
    ["INVALID_CREDENTIALS", "Invalid email or password."],
    ["EMAIL_NOT_VERIFIED", "Please verify your email before logging in."],
    ["USER_EXISTS", "An account with this email already exists."],
    ["USER_NOT_FOUND", "No account found with this email."],
    ["RATE_LIMITED", "Too many attempts. Please wait a moment and try again."],
    ["RATE_LIMIT_EXCEEDED", "Too many attempts. Please wait a moment and try again."],
    ["INVALID_TOKEN", "Your reset link has expired. Please request a new one."],
    ["TOKEN_EXPIRED", "Your reset link has expired. Please request a new one."],
  ] as const)("maps %s to an actionable error", (error, message) => {
    expect(getErrorMessage({ success: false, message: "", error })).toBe(message);
    expect(isSessionUnavailable({ success: false, message: "", error })).toBe(false);
  });

  it.each([
    ["UNAUTHORIZED", "Unauthorized."],
    ["FORBIDDEN", "You do not have permission to perform this action."],
    ["VALIDATION_ERROR", "Please check your input and try again."],
    ["INVALID_INPUT", "Please check your input and try again."],
    ["SERVICE_UNAVAILABLE", "An error occurred. Please try again."],
  ] as const)("uses a server message or fallback for %s", (error, fallback) => {
    expect(getErrorMessage({ success: false, message: "", error })).toBe(fallback);
    expect(getErrorMessage({ success: false, error, message: "Please retry later" })).toBe(
      "Please retry later",
    );
  });

  it("recognizes connection failure as a temporary session outage", () => {
    expect(isSessionUnavailable({ success: false, message: "", error: "CONNECTION_FAILED" })).toBe(
      true,
    );
  });

  it("always includes credentials and uses the same-origin auth path", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ success: true, message: "User retrieved", data: { user: { id: "1" } } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await api.getMe();

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/me",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("adds the CSRF cookie value to unsafe requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true, message: "Login successful" }));
    vi.stubGlobal("document", { cookie: "theme=light; csrf_token=csrf-value" });
    vi.stubGlobal("fetch", fetchMock);

    await api.login("user@example.com", "secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-value" }),
        method: "POST",
      }),
    );
  });

  it("uses the collision-free admin proxy path in same-origin mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ success: true, message: "Users listed", data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await api.admin.listUsers({ page: 2, filterBanned: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users?page=2&filterBanned=false",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("uses the billing proxy path and CSRF for the Checkout smoke test", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        message: "Checkout created",
        data: { url: "https://checkout.stripe.com/test" },
      }),
    );
    vi.stubGlobal("document", { cookie: "csrf_token=csrf-value" });
    vi.stubGlobal("fetch", fetchMock);

    await api.billing.createCheckoutTest();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/test-checkout",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-value" }),
        method: "POST",
      }),
    );
  });

  it("preserves the HTTP status when an upstream returns malformed JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{not-json", {
        headers: { "content-type": "application/json" },
        status: 401,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.getMe()).resolves.toEqual({
      error: "UNAUTHORIZED",
      message: "Authentication required.",
      success: false,
    });
  });

  it("normalizes a non-JSON upstream failure as service unavailable", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("upstream down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.getMe();

    expect(response).toEqual({
      error: "SERVICE_UNAVAILABLE",
      message: "Request failed with status 503.",
      success: false,
    });
    expect(isSessionUnavailable(response)).toBe(true);
  });

  it("normalizes fetch rejection without exposing the thrown error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret upstream detail"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await api.getMe();

    expect(response).toEqual({
      error: "CONNECTION_FAILED",
      message: "Unable to connect to server. Please check your connection.",
      success: false,
    });
    expect(getErrorMessage(response)).toBe(
      "Unable to connect to server. Please check your connection.",
    );
  });
});
