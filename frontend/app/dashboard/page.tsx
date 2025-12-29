"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AuthUser } from "@supabase-modular-auth/types";
import { useRouter } from "next/navigation";

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

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await api.logout();
    } catch (err) {
      // Even if logout fails, redirect to login
      console.error("Logout error:", err);
    } finally {
      router.push("/login");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-black">Dashboard</h1>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6 text-black">Welcome!</h2>

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
              <span className="ml-2 text-gray-900 font-mono text-sm">{user.id}</span>
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
