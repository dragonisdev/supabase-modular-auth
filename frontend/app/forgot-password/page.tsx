"use client";

import { forgotPasswordSchema } from "@supabase-modular-auth/types";
import Link from "next/link";
import React, { useCallback, useState, type ChangeEvent, type SyntheticEvent } from "react";

import { FormInput } from "@/components";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);
      setFieldErrors({});

      const validation = forgotPasswordSchema.safeParse({ email });

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
        await api.forgotPassword(email);
        // Always show success to prevent email enumeration
        setSuccess(true);
        setEmail("");
      } catch {
        // Still show success even on error (security)
        setSuccess(true);
      } finally {
        setLoading(false);
      }
    },
    [email],
  );

  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  }, []);

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-green-600">Check Your Email</h2>
            <p className="mb-6 text-gray-600">
              If an account exists with this email, a password reset link has been sent.
            </p>
            <Link
              href="/login"
              className="text-blue-600 underline hover:text-blue-800"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold text-black">Forgot Password</h1>

        <p className="mb-6 text-center text-gray-600">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {loading ? "Sending..." : "Send Reset Link"}
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
