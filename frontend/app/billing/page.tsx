"use client";

import type { BillingOverviewData, BillingPlan } from "@supabase-modular-auth/types";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { api, getErrorMessage, isSessionUnavailable } from "@/lib/api";

const formatMoney = (plan: BillingPlan): string =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: plan.currency.toUpperCase(),
  }).format(plan.unitAmount / 100);

interface PlanCardProps {
  activeAction: string | null;
  canChoose: boolean;
  onChoose: (priceId: string) => void;
  plan: BillingPlan;
}

function PlanCard({ activeAction, canChoose, onChoose, plan }: PlanCardProps) {
  const choosePlan = useCallback(() => {
    onChoose(plan.priceId);
  }, [onChoose, plan.priceId]);

  return (
    <article className="flex flex-col rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-950">{plan.name}</h3>
      {plan.description && <p className="mt-2 flex-1 text-sm text-gray-600">{plan.description}</p>}
      <p className="mt-5 text-2xl font-bold text-gray-950">
        {formatMoney(plan)}
        <span className="text-sm font-normal text-gray-600">
          {` / ${plan.intervalCount > 1 ? `${plan.intervalCount} ` : ""}${plan.interval}`}
        </span>
      </p>
      {canChoose && (
        <button
          type="button"
          disabled={activeAction !== null}
          onClick={choosePlan}
          className="mt-5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-gray-400"
        >
          {activeAction === plan.priceId ? "Opening checkout…" : "Choose plan"}
        </button>
      )}
    </article>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<BillingOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);

  const activeSubscription = useMemo(
    () =>
      overview?.subscriptions.find((subscription) =>
        ["active", "past_due", "trialing"].includes(subscription.status),
      ) || null,
    [overview],
  );

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");

    const response = await api.billing.getOverview();
    if (response.success && response.data) {
      setOverview(response.data);
    } else if (response.error === "UNAUTHORIZED") {
      router.push("/login");
    } else {
      setError(getErrorMessage(response));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    setCheckoutCompleted(new URLSearchParams(window.location.search).get("checkout") === "success");
    void loadOverview();
  }, [loadOverview]);

  const redirectFromAction = useCallback(
    async (action: string, request: () => ReturnType<typeof api.billing.createPortal>) => {
      setActiveAction(action);
      setError("");
      const response = await request();

      if (response.success && response.data?.url) {
        window.location.assign(response.data.url);
        return;
      }

      if (response.error === "UNAUTHORIZED") {
        router.push("/login");
        return;
      }

      setError(
        isSessionUnavailable(response)
          ? "Billing is temporarily unavailable. Your session is still active; please try again."
          : getErrorMessage(response),
      );
      setActiveAction(null);
    },
    [router],
  );

  const retryOverview = useCallback(() => {
    void loadOverview();
  }, [loadOverview]);

  const openPortal = useCallback(() => {
    void redirectFromAction("portal", api.billing.createPortal);
  }, [redirectFromAction]);

  const choosePlan = useCallback(
    (priceId: string) => {
      void redirectFromAction(priceId, () => api.billing.createCheckout(priceId));
    },
    [redirectFromAction],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p
          className="text-gray-600"
          role="status"
        >
          Loading billing…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">Account</p>
            <h1 className="text-3xl font-bold text-gray-950">Billing</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Plans and prices are loaded from the configured Stripe catalog.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="self-start rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Back to dashboard
          </Link>
        </div>

        {checkoutCompleted && (
          <div
            className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900"
            role="status"
          >
            Checkout completed. Subscription status may take a moment to update from Stripe.
          </div>
        )}

        {error && (
          <div
            className="mt-6 rounded-md border border-red-200 bg-red-50 p-4"
            role="alert"
          >
            <p className="text-sm text-red-900">{error}</p>
            <button
              type="button"
              onClick={retryOverview}
              className="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800"
            >
              Try again
            </button>
          </div>
        )}

        {overview && !overview.enabled && (
          <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-950">Billing is not configured</h2>
            <p className="mt-2 text-sm text-amber-900">
              Enable billing and add allowlisted Stripe Price IDs in the backend environment.
            </p>
          </section>
        )}

        {overview?.enabled && (
          <>
            <section className="mt-8 rounded-lg bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-950">Subscription</h2>
                  {activeSubscription ? (
                    <div className="mt-3 space-y-1 text-sm text-gray-700">
                      <p>
                        Status: <span className="font-medium">{activeSubscription.status}</span>
                      </p>
                      {activeSubscription.currentPeriodEnd && (
                        <p>
                          Current period ends{" "}
                          {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString()}.
                        </p>
                      )}
                      {activeSubscription.cancelAtPeriodEnd && (
                        <p className="text-amber-700">Cancellation is scheduled for period end.</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600">No active subscription.</p>
                  )}
                </div>

                {overview.subscriptions.length > 0 && (
                  <button
                    type="button"
                    disabled={activeAction !== null}
                    onClick={openPortal}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-400"
                  >
                    {activeAction === "portal" ? "Opening…" : "Manage billing"}
                  </button>
                )}
              </div>
            </section>

            <section
              className="mt-8"
              aria-labelledby="plans-heading"
            >
              <h2
                id="plans-heading"
                className="text-xl font-semibold text-gray-950"
              >
                Available plans
              </h2>

              {activeSubscription && (
                <p className="mt-2 text-sm text-gray-600">
                  Use Manage billing to change or cancel the current subscription.
                </p>
              )}

              {overview.plans.length === 0 ? (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
                  No recurring prices are configured.
                </div>
              ) : (
                <div className="mt-4 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {overview.plans.map((plan) => (
                    <PlanCard
                      key={plan.priceId}
                      activeAction={activeAction}
                      canChoose={!activeSubscription}
                      onChoose={choosePlan}
                      plan={plan}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
