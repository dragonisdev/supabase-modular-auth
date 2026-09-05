"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api, getErrorMessage, isSessionUnavailable } from "@/lib/api";

export default function AdminBillingPage() {
  const router = useRouter();
  const [accessChecked, setAccessChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [eventId, setEventId] = useState("");
  const [userId, setUserId] = useState("");
  const [pending, setPending] = useState<"replay" | "reconcile" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  const goBack = useCallback(() => {
    router.push("/admin");
  }, [router]);

  const updateEventId = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setEventId(event.target.value);
  }, []);

  const updateUserId = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setUserId(event.target.value);
  }, []);

  useEffect(() => {
    const verifyAdmin = async () => {
      const response = await api.getMe();
      if (!response.success || !response.data?.user) {
        setAccessChecked(true);
        if (isSessionUnavailable(response)) {
          setError(getErrorMessage(response));
          return;
        }
        router.push("/login");
        return;
      }

      if (!response.data.user.is_admin) {
        setAccessChecked(true);
        router.push("/dashboard");
        return;
      }

      setIsAdmin(true);
      setAccessChecked(true);
    };

    void verifyAdmin();
  }, [router]);

  const replayWebhook = useCallback(async () => {
    const normalizedEventId = eventId.trim();
    if (!normalizedEventId || !window.confirm(`Replay ${normalizedEventId} from Stripe?`)) {
      return;
    }

    setPending("replay");
    setError("");
    setResult("");
    const response = await api.admin.replayBillingWebhook(normalizedEventId);

    if (response.success && response.data) {
      setResult(
        `${response.data.eventId} (${response.data.eventType}) was retrieved and processed.`,
      );
    } else {
      setError(getErrorMessage(response));
    }
    setPending(null);
  }, [eventId]);

  const reconcileUser = useCallback(async () => {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return;
    }

    setPending("reconcile");
    setError("");
    setResult("");
    const response = await api.admin.reconcileBillingUser(normalizedUserId);

    if (response.success && response.data) {
      setResult(
        response.data.customerFound
          ? `Synchronized ${response.data.subscriptionsSynchronized} Stripe subscription(s) for ${response.data.userId}.`
          : `No Stripe customer mapping exists for ${response.data.userId}.`,
      );
    } else {
      setError(getErrorMessage(response));
    }
    setPending(null);
  }, [userId]);

  if (!accessChecked) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <p className="mx-auto max-w-4xl py-10 text-center text-gray-600">Checking access…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return error ? (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-950">Session check unavailable</h1>
          <p className="mt-3 text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={reloadPage}
            className="mt-5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </main>
    ) : null;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">Administration</p>
            <h1 className="text-3xl font-bold text-gray-950">Billing operations</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Repair the local billing projection from Stripe. Every operation is audit logged.
            </p>
          </div>
          <button
            type="button"
            onClick={goBack}
            className="self-start rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Back to admin
          </button>
        </header>

        {error && (
          <div
            className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            role="alert"
          >
            {error}
          </div>
        )}
        {result && (
          <div
            className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
            role="status"
          >
            {result}
          </div>
        )}

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Replay a webhook</h2>
            <p className="mt-2 text-sm text-gray-600">
              Retrieves the immutable event from Stripe and reapplies supported subscription data.
            </p>
            <label
              htmlFor="stripe-event-id"
              className="mt-5 block text-sm font-medium text-gray-800"
            >
              Stripe event ID
            </label>
            <input
              id="stripe-event-id"
              value={eventId}
              onChange={updateEventId}
              placeholder="evt_..."
              autoComplete="off"
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
            <button
              type="button"
              disabled={pending !== null || eventId.trim().length === 0}
              onClick={replayWebhook}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {pending === "replay" ? "Replaying…" : "Replay event"}
            </button>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-950">Reconcile a user</h2>
            <p className="mt-2 text-sm text-gray-600">
              Rebuilds one user&apos;s subscription projection from their mapped Stripe customer.
            </p>
            <label
              htmlFor="supabase-user-id"
              className="mt-5 block text-sm font-medium text-gray-800"
            >
              Supabase user UUID
            </label>
            <input
              id="supabase-user-id"
              value={userId}
              onChange={updateUserId}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-950 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
            <button
              type="button"
              disabled={pending !== null || userId.trim().length === 0}
              onClick={reconcileUser}
              className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {pending === "reconcile" ? "Reconciling…" : "Reconcile user"}
            </button>
          </section>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          These tools update projections only. Stripe remains the billing source of truth.
        </p>
      </div>
    </main>
  );
}
