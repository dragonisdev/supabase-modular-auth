import type {
  ApiResponse,
  ValidationErrorDetail,
  LoginResponseData,
  GetMeResponseData,
  GoogleAuthUrlResponseData,
} from "@supabase-modular-auth/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const CSRF_COOKIE_NAME = "csrf_token";

// Re-export types for convenience
export type { ApiResponse, ValidationErrorDetail };

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${CSRF_COOKIE_NAME}=([^;]+)`));
  return match ? match[2] : null;
}

/**
 * Fetch CSRF token from server (call this on app init)
 */
export async function initCsrf(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/csrf-token`, {
      credentials: "include",
    });
  } catch {
    // Silently fail - CSRF cookie will be set on first GET request anyway
    void 0;
  }
}

/**
 * Parse validation errors from API response into field-specific errors
 */
export function parseFieldErrors(details?: ValidationErrorDetail[]): Record<string, string> {
  if (!details || details.length === 0) return {};

  const fieldErrors: Record<string, string> = {};
  for (const detail of details) {
    // Use the first path segment as the field name
    const field = detail.path[0] || "general";
    // Only keep the first error for each field
    if (!fieldErrors[field]) {
      fieldErrors[field] = detail.message;
    }
  }
  return fieldErrors;
}

/**
 * Get a user-friendly error message from an API response
 */
export function getErrorMessage(response: ApiResponse): string {
  // If we have validation details, format them nicely
  if (response.details && response.details.length > 0) {
    return response.details.map((d) => d.message).join(". ");
  }

  // Map error codes to user-friendly messages
  switch (response.error) {
    case "AUTH_FAILED":
    case "INVALID_CREDENTIALS":
      return "Invalid email or password.";
    case "EMAIL_NOT_VERIFIED":
      return "Please verify your email before logging in.";
    case "USER_EXISTS":
      return "An account with this email already exists.";
    case "USER_NOT_FOUND":
      return "No account found with this email.";
    case "VALIDATION_ERROR":
    case "INVALID_INPUT":
      return response.message || "Please check your input and try again.";
    case "RATE_LIMITED":
    case "RATE_LIMIT_EXCEEDED":
      return "Too many attempts. Please wait a moment and try again.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "Your reset link has expired. Please request a new one.";
    default:
      return response.message || "An error occurred. Please try again.";
  }
}

async function fetchAPI<T = unknown>(
  endpoint: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = options?.method?.toUpperCase() || "GET";

  // Build headers with CSRF token for non-GET requests
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  // Add CSRF token for unsafe methods
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      credentials: "include", // CRITICAL: Always include cookies
      headers,
    });

    const data: ApiResponse<T> = await response.json();
    return data;
  } catch {
    // Network error or server unreachable
    return {
      success: false,
      message: "Unable to connect to server. Please check your connection.",
      error: "CONNECTION_FAILED",
    };
  }
}

export const api = {
  // Auth endpoints
  register: (email: string, password: string, username: string) =>
    fetchAPI("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, username }),
    }),

  login: (email: string, password: string) =>
    fetchAPI<LoginResponseData>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    fetchAPI("/auth/logout", {
      method: "POST",
    }),

  forgotPassword: (email: string) =>
    fetchAPI("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (password: string, token: string) =>
    fetchAPI("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ password, token }),
    }),

  getMe: () => fetchAPI<GetMeResponseData>("/auth/me"),

  // Google OAuth
  getGoogleAuthUrl: () => fetchAPI<GoogleAuthUrlResponseData>("/auth/google/url"),
};
