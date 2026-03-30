"use client";

import type { AuthUser } from "@supabase-modular-auth/types";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.getMe();

        if (response.success && response.data) {
          setUser(response.data.user);
        } else {
          // Not authenticated, redirect to login
          router.push("/login");
        }
      } catch {
        // Error fetching user, redirect to login
        router.push("/login");
      } finally {
        setLoading(false);
      }
    };

    void fetchUser();
  }, [router]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);

    try {
      await api.logout();
    } catch {
      // Even if logout fails, redirect to login
      void 0;
    } finally {
      router.push("/login");
    }
  }, [router]);

  const handleGoToAdmin = useCallback(() => {
    router.push("/admin");
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-bold text-black">Dashboard</h1>
            <div className="flex items-center gap-3">
              {user.is_admin && (
                <button
                  onClick={handleGoToAdmin}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
                >
                  Admin Panel
                </button>
              )}

              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {loggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-6 text-2xl font-bold text-black">Welcome!</h2>

          <div className="space-y-3">
            <div>
              <span className="font-medium text-gray-700">Email:</span>
              <span className="ml-2 text-gray-900">{user.email}</span>
            </div>

            {user.username && (
              <div>
                <span className="font-medium text-gray-700">Username:</span>
                <span className="ml-2 text-gray-900">{user.username}</span>
              </div>
            )}

            <div>
              <span className="font-medium text-gray-700">User ID:</span>
              <span className="ml-2 font-mono text-sm text-gray-900">{user.id}</span>
            </div>

            <div>
              <span className="font-medium text-gray-700">Email Verified:</span>
              <span className={`ml-2 ${user.email_verified ? "text-green-600" : "text-red-600"}`}>
                {user.email_verified ? "Yes" : "No"}
              </span>
            </div>

            {user.created_at && (
              <div>
                <span className="font-medium text-gray-700">Account Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(user.created_at).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
