"use client";

import { registerFormSchema } from "@supabase-modular-auth/types";
import Link from "next/link";
import React, { useCallback, useState, type ChangeEvent, type SyntheticEvent } from "react";

import { PasswordInput, FormInput } from "@/components";
import { api, parseFieldErrors, getErrorMessage } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const passwordsMatch = password === confirmPassword || confirmPassword === "";
  const showMismatchError = !passwordsMatch && confirmPassword.length > 0;

  const handleSubmit = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setFieldErrors({});
      setSuccess(false);

      const validation = registerFormSchema.safeParse({
        email,
        username: username || undefined,
        password,
        confirmPassword,
      });

      if (!validation.success) {
        const errors: Record<string, string> = {};
        for (const issue of validation.error.issues) {
          const field = issue.path[0]?.toString() || "general";
          if (!errors[field]) {
            errors[field] = issue.message;
          }
        }
        setFieldErrors(errors);
        setLoading(false);
        return;
      }

      try {
        const response = await api.register(email, password, username);

        if (response.success) {
          setSuccess(true);
          setEmail("");
          setUsername("");
          setPassword("");
          setConfirmPassword("");
        } else {
          // Parse field-specific errors from backend
          const backendFieldErrors = parseFieldErrors(response.details);
          if (Object.keys(backendFieldErrors).length > 0) {
            setFieldErrors(backendFieldErrors);
          }
          setError(getErrorMessage(response));
        }
      } catch {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [confirmPassword, email, password, username],
  );

  const handleGoogleLogin = useCallback(async () => {
    setGoogleLoading(true);
    setError("");

    try {
      const response = await api.getGoogleAuthUrl();

      if (response.success && response.data?.url) {
        // Redirect to Google OAuth URL
        window.location.href = response.data.url;
      } else {
        setError("Failed to initiate Google signup. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred with Google signup. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  const handleUsernameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  }, []);

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  }, []);

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-green-600">Check Your Email</h2>
            <p className="mb-6 text-gray-600">
              Please check your email to verify your account before logging in.
            </p>
            <Link
              href="/login"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-black">Register</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <FormInput
            id="email"
            type="email"
            label="Email"
            value={email}
            onChange={handleEmailChange}
            required
            disabled={loading}
            error={fieldErrors.email}
          />

          <FormInput
            id="username"
            type="text"
            label="Username"
            value={username}
            onChange={handleUsernameChange}
            required
            minLength={3}
            pattern="[a-zA-Z0-9_\-]+"
            disabled={loading}
            error={fieldErrors.username}
            hint="3 characters minimum, letters, numbers, hyphens, and underscores only"
          />

          <PasswordInput
            id="password"
            label="Password"
            value={password}
            onChange={handlePasswordChange}
            required
            minLength={8}
            disabled={loading}
            error={fieldErrors.password}
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm Password"
            value={confirmPassword}
            onChange={handleConfirmPasswordChange}
            required
            minLength={8}
            disabled={loading}
            error={fieldErrors.confirmPassword}
            showMismatch={showMismatchError}
          />

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-gray-500">Or</span>
          </div>
        </div>

        {/* Google OAuth Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {googleLoading ? "Connecting to Google..." : "Continue with Google"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
