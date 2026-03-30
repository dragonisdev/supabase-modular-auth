"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo } from "react";

type VerifyStatus = "loading" | "success" | "error";

interface VerifyResult {
  status: VerifyStatus;
  errorMessage: string;
}

/**
 * Parse verification hash parameters (runs only on client)
 */
function parseVerificationHash(): VerifyResult {
  if (typeof window === "undefined") {
    return { status: "loading", errorMessage: "" };
  }

  // Supabase may return verification data in query params (PKCE/code flow)
  const query = new URLSearchParams(window.location.search);
  const queryCode = query.get("code");
  const queryError = query.get("error");
  const queryErrorDescription = query.get("error_description");

  if (queryError) {
    return {
      status: "error",
      errorMessage: queryErrorDescription || queryError || "Verification failed.",
    };
  }

  if (queryCode) {
    return { status: "success", errorMessage: "" };
  }

  const hash = window.location.hash;

  if (!hash) {
    return {
      status: "error",
      errorMessage: "No verification data found. Please use the link from your email.",
    };
  }

  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get("access_token");
  const tokenType = params.get("type");
  const error = params.get("error");
  const errorDescription = params.get("error_description");

  if (error) {
    return {
      status: "error",
      errorMessage: errorDescription || error || "Verification failed.",
    };
  }

  if (!accessToken) {
    return {
      status: "error",
      errorMessage: "Invalid verification link. Please request a new verification email.",
    };
  }

  if (tokenType === "signup" || accessToken) {
    return { status: "success", errorMessage: "" };
  }

  return { status: "success", errorMessage: "" };
}

export default function VerifyEmailPage() {
  const router = useRouter();

  // Parse hash on mount
  const { status, errorMessage } = useMemo(() => parseVerificationHash(), []);

  // Handle redirect for success case
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        router.push("/login");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="mb-4 text-2xl font-bold text-red-600">Verification Failed</h2>
            <p className="mb-6 text-gray-600">{errorMessage}</p>
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
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mb-4 text-2xl font-bold text-green-600">Email Verified!</h2>
          <p className="mb-6 text-gray-600">
            Your email has been verified successfully. You can now log in to your account.
          </p>
          <p className="mb-4 text-sm text-gray-500">Redirecting to login in 3 seconds...</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go to Login Now
          </Link>
        </div>
      </div>
    </div>
  );
}
