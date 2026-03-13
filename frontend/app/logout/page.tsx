"use client";

import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

import { api } from "@/lib/api";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      try {
        await api.logout();
      } catch {
        // Even if logout fails, redirect to login
        void 0;
      } finally {
        router.push("/login");
      }
    };

    void logout();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Logging out...</p>
      </div>
    </div>
  );
}
