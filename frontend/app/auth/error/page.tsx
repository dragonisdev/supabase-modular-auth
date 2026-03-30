"use client";

import Link from "next/link";
import React from "react";

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 text-center shadow-md">
        <div className="mb-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
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
        </div>

        <h1 className="mb-4 text-2xl font-bold text-gray-900">Authentication Failed</h1>

        <p className="mb-6 text-gray-600">
          There was an error during the authentication process. This could be due to:
        </p>

        <ul className="mb-6 space-y-1 text-left text-sm text-gray-500">
          <li>• You cancelled the authentication</li>
          <li>• Network connection issues</li>
          <li>• Temporary service unavailability</li>
        </ul>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Try Again
          </Link>

          <Link
            href="/"
            className="block w-full rounded-md bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
