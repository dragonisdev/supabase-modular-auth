"use client";

import type { AuthUser, BillingOverviewData } from "@supabase-modular-auth/types";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { api, getErrorMessage, isSessionUnavailable } from "@/lib/api";

type CheckoutReturn = "cancelled" | "returned" | null;

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [billing, setBilling] = useState<BillingOverviewData | null>(null);
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn>(null);
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const returnState = new URLSearchParams(window.location.search).get("checkout");
    if (returnState === "returned" || returnState === "cancelled") {
      setCheckoutReturn(returnState);
    }

    const fetchBilling = async () => {
      const [userResponse, billingResponse] = await Promise.all([
        api.getMe(),
        api.billing.getOverview(),
      ]);
      if (userResponse.success && userResponse.data && billingResponse.success) {
        setUser(userResponse.data.user);
        setBilling(billingResponse.data ?? null);
      } else if (isSessionUnavailable(userResponse) || isSessionUnavailable(billingResponse)) {
        setError(
          getErrorMessage(isSessionUnavailable(userResponse) ? userResponse : billingResponse),
        );
      } else {
        router.push("/login");
      }
      setLoading(false);
    };

    void fetchBilling();
  }, [router]);

  const handleCheckout = useCallback(async () => {
    setStartingCheckout(true);
    setError("");

    const response = await api.billing.createCheckout();
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
        <p className="text-gray-600">Loading billing...</p>
      </main>
    );
  }

  if (!user) {
    return error ? (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md rounded-lg bg-white p-6 text-center shadow-md">
          <h1 className="text-xl font-semibold">Billing is temporarily unavailable</h1>
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
        <p className="text-sm font-medium text-blue-700">Billing</p>
        <h1 className="mt-2 text-3xl font-bold">Buy credits</h1>
        <p className="mt-4 text-gray-600">
          Your current balance is <strong>{billing?.credits ?? 0} credits</strong>. Stripe securely
          collects payment details for the configured one-time credit pack.
        </p>

        {checkoutReturn === "returned" && (
          <div
            role="status"
            className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
          >
            Stripe returned you to the app. The signed webhook grants credits independently, so the
            updated balance may take a moment to appear. Refresh this page to check it.
          </div>
        )}

        {checkoutReturn === "cancelled" && (
          <div
            role="status"
            className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            Checkout was cancelled. You can try again when you are ready.
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
            {startingCheckout
              ? "Opening Checkout..."
              : `Buy ${billing?.creditsPerPurchase ?? 20} credits`}
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-300 px-5 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to dashboard
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-500">Signed in as {user.email}.</p>
      </section>
    </main>
  );
}
