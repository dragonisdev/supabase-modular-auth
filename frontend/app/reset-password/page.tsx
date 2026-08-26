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

type RecoveryStatus = "checking" | "ready" | "error";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("checking");

  const passwordsMatch = password === confirmPassword || confirmPassword === "";
  const showMismatchError = !passwordsMatch && confirmPassword.length > 0;

  // The backend verifies Supabase's token hash before redirecting here. React
  // receives only a non-sensitive status marker; the recovery token stays in
  // a short-lived HttpOnly cookie.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recovery = params.get("recovery");
    const recoveryError = params.get("error");

    if (recovery === "verified") {
      setRecoveryStatus("ready");
      return;
    }

    if (recoveryError === "service_unavailable") {
      setError(
        "The authentication service is temporarily unavailable. Please open the email link again.",
      );
    } else {
      setError("Your reset link is invalid or expired. Please request a new password reset email.");
    }
    setRecoveryStatus("error");
  }, []);

  const handleSubmit = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setError("");
      setFieldErrors({});

      const validation = resetPasswordFormSchema.safeParse({
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
        const response = await api.resetPassword(password);

        if (response.success) {
          setSuccess(true);
        } else {
          setError(getErrorMessage(response));
          if (response.error === "INVALID_TOKEN" || response.error === "TOKEN_EXPIRED") {
            setRecoveryStatus("error");
          }
        }
      } catch {
        setError("An unexpected error occurred. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [confirmPassword, password],
  );

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  }, []);

  const handleConfirmPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
  }, []);

  if (recoveryStatus === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Checking your reset link...</p>
        </div>
      </div>
    );
  }

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

  if (recoveryStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
          <h1 className="mb-4 text-2xl font-bold text-red-600">Reset Link Unavailable</h1>
          <p className="mb-6 text-gray-600">{error}</p>
          <Link
            href="/forgot-password"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Request a New Link
          </Link>
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
            disabled={loading}
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
