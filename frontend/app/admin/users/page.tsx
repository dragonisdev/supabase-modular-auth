"use client";

import type { AdminUser } from "@supabase-modular-auth/types";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api, getErrorMessage } from "@/lib/api";

export default function AdminUsersPage() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<"" | "user" | "admin">("");
  const [filterBanned, setFilterBanned] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState<"user" | "admin">("user");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [editPassword, setEditPassword] = useState("");
  const [editBanned, setEditBanned] = useState(false);
  const [editBanReason, setEditBanReason] = useState("");
  const [editBanExpiryLocal, setEditBanExpiryLocal] = useState("");

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const getCurrentUserListFilters = useCallback(() => {
    return {
      search: search || undefined,
      filterRole: filterRole || undefined,
      filterBanned: filterBanned === "" ? undefined : filterBanned === "true",
    };
  }, [search, filterRole, filterBanned]);

  const loadUsers = useCallback(
    async (params: {
      page: number;
      limit: number;
      search?: string;
      filterRole?: "user" | "admin";
      filterBanned?: boolean;
    }) => {
      setLoading(true);
      setError("");

      const response = await api.admin.listUsers({
        page: params.page,
        limit: params.limit,
        search: params.search,
        filterRole: params.filterRole,
        filterBanned: params.filterBanned,
      });

      if (!response.success || !response.data) {
        setError(getErrorMessage(response));
        setLoading(false);
        return;
      }

      setUsers(response.data.items);
      setTotalPages(response.data.totalPages);
      setLoading(false);
    },
    [],
  );

  const handleBack = useCallback(() => {
    router.push("/admin");
  }, [router]);

  const handleNewEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewEmail(e.target.value);
  }, []);

  const handleNewPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value);
  }, []);

  const handleNewUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewUsername(e.target.value);
  }, []);

  const handleNewRoleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === "user" || e.target.value === "admin") {
      setNewRole(e.target.value);
    }
  }, []);

  const handleEditEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditEmail(e.target.value);
  }, []);

  const handleEditUsernameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditUsername(e.target.value);
  }, []);

  const handleEditRoleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEditRole(e.target.value === "admin" ? "admin" : "user");
  }, []);

  const handleEditPasswordChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditPassword(e.target.value);
  }, []);

  const handleEditIsAdminChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditIsAdmin(e.target.checked);
  }, []);

  const handleEditBannedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditBanned(e.target.checked);
  }, []);

  const handleEditBanReasonChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditBanReason(e.target.value);
  }, []);

  const handleEditBanExpiryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditBanExpiryLocal(e.target.value);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleFilterRoleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextRole = e.target.value;
    if (nextRole === "" || nextRole === "user" || nextRole === "admin") {
      setFilterRole(nextRole);
    }
  }, []);

  const handleFilterBannedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterBanned(e.target.value);
  }, []);

  const handleSelectionChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const id = e.currentTarget.dataset.userId;
    const isChecked = e.currentTarget.checked;
    if (!id) {
      return;
    }

    setSelected((prev) => ({
      ...prev,
      [id]: isChecked,
    }));
  }, []);

  const handleLimitChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const nextLimit = Number(e.target.value);
      setLimit(nextLimit);
      setPage(1);
      void loadUsers({ page: 1, limit: nextLimit, ...getCurrentUserListFilters() });
    },
    [getCurrentUserListFilters, loadUsers],
  );

  const handlePrevPage = useCallback(() => {
    setPage((p) => {
      const nextPage = Math.max(1, p - 1);
      if (nextPage !== p) {
        void loadUsers({ page: nextPage, limit, ...getCurrentUserListFilters() });
      }
      return nextPage;
    });
  }, [getCurrentUserListFilters, limit, loadUsers]);

  const handleNextPage = useCallback(() => {
    setPage((p) => {
      const nextPage = Math.min(totalPages, p + 1);
      if (nextPage !== p) {
        void loadUsers({ page: nextPage, limit, ...getCurrentUserListFilters() });
      }
      return nextPage;
    });
  }, [getCurrentUserListFilters, limit, loadUsers, totalPages]);

  const isoToLocalDateTime = useCallback((iso: string | null): string => {
    if (!iso) {
      return "";
    }

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }, []);

  const localDateTimeToIso = useCallback((value: string): string | undefined => {
    if (!value.trim()) {
      return undefined;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString();
  }, []);

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
      await loadUsers({ page: 1, limit, ...getCurrentUserListFilters() });
      setAccessChecked(true);
    };

    void verifyAdmin();
  }, [getCurrentUserListFilters, limit, loadUsers, router]);

  const refresh = useCallback(async () => {
    setSelected({});
    await loadUsers({ page, limit, ...getCurrentUserListFilters() });
  }, [getCurrentUserListFilters, limit, loadUsers, page]);

  const createUser = useCallback(async () => {
    setError("");

    const response = await api.admin.createUser({
      email: newEmail,
      password: newPassword,
      username: newUsername || undefined,
      role: newRole,
      emailConfirmed: false,
    });

    if (!response.success) {
      setError(getErrorMessage(response));
      return;
    }

    setNewEmail("");
    setNewPassword("");
    setNewUsername("");
    setNewRole("user");
    await refresh();
  }, [newEmail, newPassword, newUsername, newRole, refresh]);

  const banOrUnban = useCallback(
    async (user: AdminUser) => {
      let response;
      if (user.banned) {
        response = await api.admin.unbanUser(user.id);
      } else {
        const reason = window.prompt("Optional ban reason:", user.ban_reason || "") ?? "";
        const expiryInput =
          window.prompt(
            "Optional ban expiry (local datetime, e.g. 2026-03-31T18:00). Leave empty for permanent ban:",
            user.ban_expires_at ? isoToLocalDateTime(user.ban_expires_at) : "",
          ) ?? "";

        const expiresAt = localDateTimeToIso(expiryInput);
        if (expiryInput.trim() && !expiresAt) {
          setError("Invalid ban expiry date/time format.");
          return;
        }

        response = await api.admin.banUser(user.id, {
          reason: reason.trim() || "No reason provided",
          expiresAt,
        });
      }

      if (!response.success) {
        setError(getErrorMessage(response));
        return;
      }

      await refresh();
    },
    [isoToLocalDateTime, localDateTimeToIso, refresh],
  );

  const deleteUser = useCallback(
    async (user: AdminUser) => {
      const confirmed = window.confirm(`Delete user ${user.email}? This cannot be undone.`);
      if (!confirmed) {
        return;
      }

      const response = await api.admin.deleteUser(user.id);
      if (!response.success) {
        setError(getErrorMessage(response));
        return;
      }

      await refresh();
    },
    [refresh],
  );

  const runBulkAction = useCallback(
    async (action: "ban" | "unban" | "delete") => {
      if (selectedIds.length === 0) {
        return;
      }

      const confirmed = window.confirm(`Run ${action} for ${selectedIds.length} selected user(s)?`);
      if (!confirmed) {
        return;
      }

      let reason: string | undefined;
      let expiresAt: string | undefined;

      if (action === "ban") {
        const promptedReason = window.prompt("Optional bulk ban reason:", "") ?? "";
        const promptedExpiry =
          window.prompt(
            "Optional bulk ban expiry (local datetime, e.g. 2026-03-31T18:00). Leave empty for permanent ban:",
            "",
          ) ?? "";

        expiresAt = localDateTimeToIso(promptedExpiry);
        if (promptedExpiry.trim() && !expiresAt) {
          setError("Invalid bulk ban expiry date/time format.");
          return;
        }

        reason = promptedReason.trim() || undefined;
      }

      const response = await api.admin.bulkAction({
        action,
        userIds: selectedIds,
        reason,
        expiresAt,
      });

      if (!response.success) {
        setError(getErrorMessage(response));
        return;
      }

      await refresh();
    },
    [localDateTimeToIso, refresh, selectedIds],
  );

  const handleStartEdit = useCallback(
    (user: AdminUser) => {
      setEditingUserId(user.id);
      setEditEmail(user.email);
      setEditUsername(user.username || "");
      setEditRole(user.role === "admin" ? "admin" : "user");
      setEditIsAdmin(user.is_admin);
      setEditPassword("");
      setEditBanned(user.banned);
      setEditBanReason(user.ban_reason || "");
      setEditBanExpiryLocal(isoToLocalDateTime(user.ban_expires_at));
      setError("");
    },
    [isoToLocalDateTime],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingUserId(null);
    setEditPassword("");
    setError("");
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingUserId) {
      return;
    }

    const banExpiresAt = localDateTimeToIso(editBanExpiryLocal);
    if (editBanExpiryLocal.trim() && !banExpiresAt) {
      setError("Invalid ban expiry date/time format.");
      return;
    }

    const payload = {
      email: editEmail,
      username: editUsername.trim() ? editUsername.trim() : null,
      role: editRole,
      isAdmin: editIsAdmin,
      password: editPassword.trim() ? editPassword : undefined,
      banned: editBanned,
      banReason: editBanned ? editBanReason.trim() || null : null,
      banExpiresAt: editBanned ? (banExpiresAt ?? null) : null,
    };

    const response = await api.admin.updateUser(editingUserId, payload);
    if (!response.success) {
      setError(getErrorMessage(response));
      return;
    }

    setEditingUserId(null);
    setEditPassword("");
    await refresh();
  }, [
    editBanExpiryLocal,
    editBanReason,
    editBanned,
    editEmail,
    editIsAdmin,
    editPassword,
    editRole,
    editUsername,
    editingUserId,
    localDateTimeToIso,
    refresh,
  ]);

  const handleApplyFilters = useCallback(() => {
    setPage(1);
    void loadUsers({ page: 1, limit, ...getCurrentUserListFilters() });
  }, [getCurrentUserListFilters, limit, loadUsers]);

  const handleBulkBan = useCallback(() => {
    void runBulkAction("ban");
  }, [runBulkAction]);

  const handleBulkUnban = useCallback(() => {
    void runBulkAction("unban");
  }, [runBulkAction]);

  const handleBulkDelete = useCallback(() => {
    void runBulkAction("delete");
  }, [runBulkAction]);

  const handleBanOrUnbanClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.userId;
      if (!id) {
        return;
      }

      const user = users.find((u) => u.id === id);
      if (!user) {
        return;
      }

      void banOrUnban(user);
    },
    [banOrUnban, users],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.userId;
      if (!id) {
        return;
      }

      const user = users.find((u) => u.id === id);
      if (!user) {
        return;
      }

      void deleteUser(user);
    },
    [deleteUser, users],
  );

  const formatBanContext = useCallback((user: AdminUser): string | null => {
    const reason = user.ban_reason?.trim();
    const expiresAt = user.ban_expires_at;

    if (!reason && !expiresAt) {
      return null;
    }

    const details: string[] = [];

    if (reason) {
      details.push(reason);
    }

    if (expiresAt) {
      const parsed = new Date(expiresAt);
      if (!Number.isNaN(parsed.getTime())) {
        const nowMs = Date.now();
        const diffMs = parsed.getTime() - nowMs;

        if (diffMs > 0) {
          const totalMinutes = Math.ceil(diffMs / (1000 * 60));
          const days = Math.floor(totalMinutes / (60 * 24));
          const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
          const minutes = totalMinutes % 60;

          const parts: string[] = [];
          if (days > 0) {
            parts.push(`${days}d`);
          }
          if (hours > 0) {
            parts.push(`${hours}h`);
          }
          if (minutes > 0 || parts.length === 0) {
            parts.push(`${minutes}m`);
          }

          details.push(`for ${parts.join(" ")}`);
        } else {
          details.push(`expired ${parsed.toLocaleString()}`);
        }
      } else {
        details.push(`until ${expiresAt}`);
      }
    }

    return details.length > 0 ? details.join(" • ") : null;
  }, []);

  const handleEditClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.userId;
      if (!id) {
        return;
      }

      const user = users.find((u) => u.id === id);
      if (!user) {
        return;
      }

      handleStartEdit(user);
    },
    [handleStartEdit, users],
  );

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
          <h1 className="text-2xl font-bold text-black">Admin • Users</h1>
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

        <section className="mb-6 rounded-lg bg-white p-4 shadow">
          <h2 className="mb-3 text-lg font-semibold text-black">Create User</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input
              type="email"
              value={newEmail}
              onChange={handleNewEmailChange}
              placeholder="email"
              autoComplete="email"
              className="rounded border px-3 py-2"
            />
            <input
              type="password"
              value={newPassword}
              onChange={handleNewPasswordChange}
              placeholder="password"
              autoComplete="new-password"
              className="rounded border px-3 py-2"
            />
            <input
              value={newUsername}
              onChange={handleNewUsernameChange}
              placeholder="username"
              className="rounded border px-3 py-2"
            />
            <select
              value={newRole}
              onChange={handleNewRoleChange}
              className="rounded border px-3 py-2"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <button
            onClick={createUser}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Create
          </button>
        </section>

        {editingUserId && (
          <section className="mb-6 rounded-lg border border-indigo-200 bg-white p-4 shadow">
            <h2 className="mb-3 text-lg font-semibold text-black">Edit User</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <input
                type="email"
                value={editEmail}
                onChange={handleEditEmailChange}
                placeholder="email"
                className="rounded border px-3 py-2"
              />
              <input
                value={editUsername}
                onChange={handleEditUsernameChange}
                placeholder="username"
                className="rounded border px-3 py-2"
              />
              <select
                value={editRole}
                onChange={handleEditRoleChange}
                className="rounded border px-3 py-2"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
              <input
                type="password"
                value={editPassword}
                onChange={handleEditPasswordChange}
                placeholder="new password (optional)"
                autoComplete="new-password"
                className="rounded border px-3 py-2"
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editIsAdmin}
                  onChange={handleEditIsAdminChange}
                />
                is_admin
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editBanned}
                  onChange={handleEditBannedChange}
                />
                banned
              </label>

              <input
                value={editBanReason}
                onChange={handleEditBanReasonChange}
                placeholder="ban reason (optional)"
                disabled={!editBanned}
                className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-gray-100"
              />

              <input
                type="datetime-local"
                value={editBanExpiryLocal}
                onChange={handleEditBanExpiryChange}
                disabled={!editBanned}
                className="rounded border px-3 py-2 disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="rounded-md bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        <section className="rounded-lg bg-white p-4 shadow">
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search by email/username"
              className="rounded border px-3 py-2"
            />
            <select
              value={filterRole}
              onChange={handleFilterRoleChange}
              className="rounded border px-3 py-2"
            >
              <option value="">All roles</option>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <select
              value={filterBanned}
              onChange={handleFilterBannedChange}
              className="rounded border px-3 py-2"
            >
              <option value="">All</option>
              <option value="true">Banned</option>
              <option value="false">Not banned</option>
            </select>
            <button
              onClick={handleApplyFilters}
              className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700"
            >
              Apply
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={handleBulkBan}
              className="rounded-md bg-amber-600 px-3 py-2 text-white hover:bg-amber-700"
            >
              Bulk Ban
            </button>
            <button
              onClick={handleBulkUnban}
              className="rounded-md bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700"
            >
              Bulk Unban
            </button>
            <button
              onClick={handleBulkDelete}
              className="rounded-md bg-red-600 px-3 py-2 text-white hover:bg-red-700"
            >
              Bulk Delete
            </button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-gray-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Select</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Username</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Banned</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const banContext = formatBanContext(user);

                    return (
                      <tr
                        key={user.id}
                        className="border-b"
                      >
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected[user.id]}
                            data-user-id={user.id}
                            onChange={handleSelectionChange}
                          />
                        </td>
                        <td className="px-2 py-2">{user.email}</td>
                        <td className="px-2 py-2">{user.username || "-"}</td>
                        <td className="px-2 py-2">{user.role}</td>
                        <td className="px-2 py-2">
                          {user.banned ? "Yes" : "No"}
                          {banContext ? ` (${banContext})` : ""}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <button
                              data-user-id={user.id}
                              onClick={handleBanOrUnbanClick}
                              className="rounded bg-slate-200 px-2 py-1 hover:bg-slate-300"
                            >
                              {user.banned ? "Unban" : "Ban"}
                            </button>
                            <button
                              data-user-id={user.id}
                              onClick={handleDeleteClick}
                              className="rounded bg-red-100 px-2 py-1 text-red-700 hover:bg-red-200"
                            >
                              Delete
                            </button>
                            <button
                              data-user-id={user.id}
                              onClick={handleEditClick}
                              className="rounded bg-indigo-100 px-2 py-1 text-indigo-700 hover:bg-indigo-200"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Rows</label>
              <select
                value={limit}
                onChange={handleLimitChange}
                className="rounded border px-2 py-1"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
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
          </div>
        </section>
      </div>
    </main>
  );
}
