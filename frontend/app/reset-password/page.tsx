"use client";

import { useState, useEffect, type FormEvent } from "react";
import { api, getErrorMessage } from "@/lib/api";
import { resetPasswordFormSchema } from "@supabase-modular-auth/types";
import { PasswordInput } from "@/components";
import Link from "next/link";

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-600 mb-4">Password Reset Successful</h2>
            <p className="text-gray-600 mb-6">
              Your password has been reset successfully. You can now login with your new password.
            </p>
            <Link
              href="/login"
              className="inline-block py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-black">Reset Password</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordInput
            id="password"
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading}
            error={fieldErrors.password}
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading}
            error={fieldErrors.confirmPassword}
            showMismatch={showMismatchError}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">
            Back to Login
          </Link>
        </p>
      </div>
    </div>
  );
}
