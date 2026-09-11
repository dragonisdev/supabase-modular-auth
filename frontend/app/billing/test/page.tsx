"use client";

import type { AuthUser } from "@supabase-modular-auth/types";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api, getErrorMessage, isSessionUnavailable } from "@/lib/api";

type CheckoutReturn = "cancelled" | "returned" | null;

export default function StripeCheckoutTestPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn>(null);
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const returnState = new URLSearchParams(window.location.search).get("checkout");
    if (returnState === "returned" || returnState === "cancelled") {
      setCheckoutReturn(returnState);
    }

    const fetchUser = async () => {
      const response = await api.getMe();
      if (response.success && response.data) {
        setUser(response.data.user);
      } else if (isSessionUnavailable(response)) {
        setError(getErrorMessage(response));
      } else {
        router.push("/login");
      }
      setLoading(false);
    };

    void fetchUser();
  }, [router]);

  const handleCheckout = useCallback(async () => {
    setStartingCheckout(true);
    setError("");

    const response = await api.billing.createCheckoutTest();
    if (response.success && response.data?.url) {
      window.location.assign(response.data.url);
      return;
    }

    setError(getErrorMessage(response));
    setStartingCheckout(false);
  }, []);

  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600">Loading Stripe test...</p>
      </main>
    );
  }

  if (!user) {
    return error ? (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-md">
          <h1 className="text-xl font-semibold">Session check unavailable</h1>
          <p className="mt-3 text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-5 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Try again
          </button>
        </div>
      </main>
    ) : null;
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6">
      <section className="mx-auto max-w-2xl rounded-lg bg-white p-6 shadow-md sm:p-8">
        <p className="text-sm font-medium text-blue-700">Integration smoke test</p>
        <h1 className="mt-2 text-3xl font-bold">Stripe-hosted Checkout</h1>
        <p className="mt-4 text-gray-600">
          This test creates a one-time Checkout Session with the configured Stripe test Price. It
          does not create a plan, subscription, credit balance, or product entitlement.
        </p>

        {checkoutReturn === "returned" && (
          <div
            role="status"
            className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
          >
            Stripe returned the browser. Confirm the backend logged a verified{" "}
            <code className="font-mono">checkout.session.completed</code> webhook before treating
            the smoke test as complete.
          </div>
        )}

        {checkoutReturn === "cancelled" && (
          <div
            role="status"
            className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Checkout was cancelled. No product access or local billing state changed.
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={startingCheckout}
            className="rounded-md bg-blue-600 px-5 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {startingCheckout ? "Opening Checkout..." : "Start test payment"}
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-300 px-5 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          Signed in as {user.email}. Only Stripe test-mode credentials are accepted by the backend.
        </p>
      </section>
    </main>
  );
}
