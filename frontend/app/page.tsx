import Link from "next/link";
import React from "react";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-8 text-center text-3xl font-bold">Authentication Demo</h1>

        <div className="space-y-4">
          <Link
            href="/register"
            className="block w-full rounded-md bg-blue-600 px-4 py-3 text-center text-white transition-colors hover:bg-blue-700"
          >
            Register
          </Link>

          <Link
            href="/login"
            className="block w-full rounded-md bg-green-600 px-4 py-3 text-center text-white transition-colors hover:bg-green-700"
          >
            Login
          </Link>

          <Link
            href="/dashboard"
            className="block w-full rounded-md bg-gray-600 px-4 py-3 text-center text-white transition-colors hover:bg-gray-700"
          >
            Dashboard
          </Link>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="text-center text-sm text-gray-600">
            A simple authentication system built with Next.js and Supabase
          </p>
        </div>
      </div>
    </div>
  );
}
