"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-red-600"
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
            <h2 className="text-2xl font-bold text-red-600 mb-4">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
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
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-green-600"
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
          <h2 className="text-2xl font-bold text-green-600 mb-4">Email Verified!</h2>
          <p className="text-gray-600 mb-6">
            Your email has been verified successfully. You can now log in to your account.
          </p>
          <p className="text-sm text-gray-500 mb-4">Redirecting to login in 3 seconds...</p>
          <Link
            href="/login"
            className="inline-block py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Login Now
          </Link>
        </div>
      </div>
    </div>
  );
}
