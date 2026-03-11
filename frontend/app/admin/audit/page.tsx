"use client";

import type { AdminAuditLog } from "@supabase-modular-auth/types";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api, getErrorMessage } from "@/lib/api";

export default function AdminAuditPage() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [action, setAction] = useState("");

  const handleBack = useCallback(() => {
    router.push("/admin");
  }, [router]);

  const handleActionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAction(e.target.value);
  }, []);

  const loadLogs = useCallback(async (params: { page: number; limit: number; action?: string }) => {
    setLoading(true);
    const response = await api.admin.listAuditLogs({
      page: params.page,
      limit: params.limit,
      action: params.action,
    });

    if (!response.success || !response.data) {
      setError(getErrorMessage(response));
      setLoading(false);
      return;
    }

    setLogs(response.data.items);
    setTotalPages(response.data.totalPages);
    setError("");
    setLoading(false);
  }, []);

  const handleApply = useCallback(() => {
    setPage(1);
    void loadLogs({ page: 1, limit, action: action || undefined });
  }, [action, limit, loadLogs]);

  const handlePrevPage = useCallback(() => {
    setPage((p) => {
      const nextPage = Math.max(1, p - 1);
      if (nextPage !== p) {
        void loadLogs({ page: nextPage, limit, action: action || undefined });
      }
      return nextPage;
    });
  }, [action, limit, loadLogs]);

  const handleNextPage = useCallback(() => {
    setPage((p) => {
      const nextPage = Math.min(totalPages, p + 1);
      if (nextPage !== p) {
        void loadLogs({ page: nextPage, limit, action: action || undefined });
      }
      return nextPage;
    });
  }, [action, limit, loadLogs, totalPages]);

  useEffect(() => {
    const verifyAdmin = async () => {
      const me = await api.getMe();
      if (!me.success || !me.data?.user) {
        setAccessChecked(true);
        router.push("/login");
        return;
      }

      if (!me.data.user.is_admin) {
        setAccessChecked(true);
        router.push("/dashboard");
        return;
      }

      setIsAdmin(true);
      await loadLogs({ page: 1, limit, action: action || undefined });
      setAccessChecked(true);
    };

    void verifyAdmin();
  }, [action, limit, loadLogs, router]);

  if (!accessChecked) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl py-10 text-center text-gray-500">Checking access...</div>
      </main>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-black">Admin • Audit Logs</h1>
          <button
            onClick={handleBack}
            className="rounded-md bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
          >
            Back
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="mb-4 flex gap-2 rounded-lg bg-white p-4 shadow">
          <input
            value={action}
            onChange={handleActionChange}
            placeholder="Filter action (e.g. USER_BAN)"
            className="rounded border px-3 py-2"
          />
          <button
            onClick={handleApply}
            className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700"
          >
            Apply
          </button>
        </div>

        <section className="rounded-lg bg-white p-4 shadow">
          {loading ? (
            <p className="py-8 text-center text-gray-500">Loading logs...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Time</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Actor</th>
                    <th className="px-2 py-2">Target</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b"
                    >
                      <td className="px-2 py-2">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{log.action}</td>
                      <td className="px-2 py-2">{log.actor_email || log.actor_user_id}</td>
                      <td className="px-2 py-2">{log.target_email || log.target_user_id || "-"}</td>
                      <td className="px-2 py-2">{log.status}</td>
                      <td className="px-2 py-2">{log.reason || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              disabled={page <= 1}
              onClick={handlePrevPage}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-gray-700">
              Page {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={handleNextPage}
              className="rounded border px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
