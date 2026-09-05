import { describe, expect, it, vi } from "vitest";

import { api, getErrorMessage, isSessionUnavailable } from "../../frontend/lib/api.ts";

const jsonResponse = (body: unknown, init?: ResponseInit): Response => {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
};

describe("frontend API client", () => {
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
