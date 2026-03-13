"use client";

import { resetPasswordFormSchema } from "@supabase-modular-auth/types";
import Link from "next/link";
import React, {
  useCallback,
  useState,
  useEffect,
  type ChangeEvent,
  type SyntheticEvent,
} from "react";

import { PasswordInput } from "@/components";
import { api, getErrorMessage } from "@/lib/api";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword || confirmPassword === "";
  const showMismatchError = !passwordsMatch && confirmPassword.length > 0;

  // Extract token from URL hash when component mounts
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      // Supabase sends token in format: #access_token=...&type=recovery
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const tokenType = params.get("type");

      if (accessToken && tokenType === "recovery") {
        setToken(accessToken);
      } else {
        setError("Invalid or missing reset token. Please request a new password reset.");
      }
    } else {
      setError("No reset token found. Please use the link from your email.");
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setFieldErrors({});

      // Check if token is available
      if (!token) {
        setError("Reset token is missing. Please use the link from your email.");
        setLoading(false);
        return;
      }

      const validation = resetPasswordFormSchema.safeParse({
        password,
        confirmPassword,
        token,
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
        const response = await api.resetPassword(password, token);

        if (response.success) {
          setSuccess(true);
        } else {
          setError(getErrorMessage(response));
        }
      } catch {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [confirmPassword, password, token],
  );

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
            <h2 className="mb-4 text-2xl font-bold text-green-600">Password Reset Successful</h2>
            <p className="mb-6 text-gray-600">
              Your password has been reset successfully. You can now login with your new password.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
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
        <h1 className="mb-6 text-center text-2xl font-bold text-black">Reset Password</h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <PasswordInput
            id="password"
            label="New Password"
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
            disabled={loading || !token}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link
            href="/login"
            className="text-blue-600 underline hover:text-blue-800"
          >
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
