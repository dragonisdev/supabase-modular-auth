"use client";

import type { AuthUser } from "@supabase-modular-auth/types";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

export default function AdminHomePage() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const handleBack = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const handleGoUsers = useCallback(() => {
    router.push("/admin/users");
  }, [router]);

  const handleGoAudit = useCallback(() => {
    router.push("/admin/audit");
  }, [router]);

  useEffect(() => {
    const verifyAdmin = async () => {
      const response = await api.getMe();

      if (!response.success || !response.data?.user) {
        setAccessChecked(true);
        router.push("/login");
        return;
      }

      if (!response.data.user.is_admin) {
        setAccessChecked(true);
        router.push("/dashboard");
        return;
      }

      setIsAdmin(true);
      setUser(response.data.user);
      setLoading(false);
      setAccessChecked(true);
    };

    void verifyAdmin();
  }, [router]);

  if (!accessChecked) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl py-10 text-center text-gray-500">Checking access...</div>
      </main>
    );
  }

  if (!isAdmin || !user || loading) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-black">Admin Panel</h1>
              <p className="mt-2 text-sm text-gray-600">Signed in as {user.email}</p>
            </div>
            <button
              onClick={handleBack}
              className="rounded-md bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
            >
              Back
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={handleGoUsers}
            className="rounded-lg bg-teal-600 p-5 text-left text-white shadow transition-colors hover:bg-teal-700"
          >
            <h2 className="text-lg font-semibold">Manage Users</h2>
            <p className="mt-1 text-sm text-teal-100">
              Search, create, ban, unban, update, and delete users.
            </p>
          </button>

          <button
            onClick={handleGoAudit}
            className="rounded-lg bg-amber-600 p-5 text-left text-white shadow transition-colors hover:bg-amber-700"
          >
            <h2 className="text-lg font-semibold">Audit Logs</h2>
            <p className="mt-1 text-sm text-amber-100">
              Review admin actions and moderation events.
            </p>
          </button>
        </div>
      </div>
    </main>
  );
}
