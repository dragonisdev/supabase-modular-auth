"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { forgotPasswordSchema } from "@supabase-modular-auth/types";
import { FormInput } from "@/components";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
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
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-600 mb-4">Check Your Email</h2>
            <p className="text-gray-600 mb-6">
              If an account exists with this email, a password reset link has been sent.
            </p>
            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-black">Forgot Password</h1>

        <p className="text-gray-600 text-center mb-6">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            id="email"
            type="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            error={fieldErrors.email}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Sending..." : "Send Reset Link"}
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
