"use client";

// ============================================================
// Billing & plan settings panel
//
// Shows the account's current plan + subscription health and, for the
// owner, an upgrade/cancel flow driven by the Razorpay Subscription
// API. Read-only for non-owners (the API routes enforce owner-only
// server-side; this is the friendly explanation).
// ============================================================

import { useState } from "react";
import { Check, Crown, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Plan, PlanStatus } from "@/lib/auth/plans";
import { PLAN_LABELS } from "@/lib/auth/plans";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "@/components/settings/settings-panel-head";
import { openRazorpayOrder } from "./checkout";

type BillablePlan = "pro" | "pro_max";

const STATUS_META: Record<PlanStatus, { labelKey: string; className: string }> = {
  none: { labelKey: "statusNone", className: "border-border bg-muted text-muted-foreground" },
  active: {
    labelKey: "statusActive",
    className: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
  },
  past_due: {
    labelKey: "statusPastDue",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  cancelled: {
    labelKey: "statusCancelled",
    className: "border-border bg-muted/50 text-muted-foreground",
  },
};

interface PlanCardData {
  plan: Plan;
  price: string;
  tagline: string;
  automation: boolean;
  ai: boolean;
}

const PLAN_CARDS: PlanCardData[] = [
  {
    plan: "free",
    price: "₹0",
    tagline: "Core WhatsApp CRM — inbox, contacts, pipelines, broadcasts.",
    automation: false,
    ai: false,
  },
  {
    plan: "pro",
    price: "₹6,000 once",
    tagline: "No-code automations & flows on top of the core CRM.",
    automation: true,
    ai: false,
  },
  {
    plan: "pro_max",
    price: "₹8,000 once",
    tagline: "Everything in Pro plus the AI reply assistant.",
    automation: true,
    ai: true,
  },
];

export function BillingPanel() {
  const { plan, planStatus, isOwner, profile, refreshProfile } = useAuth();
  const t = useTranslations("Settings.billing");

  const [pendingPlan, setPendingPlan] = useState<BillablePlan | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const statusMeta = STATUS_META[planStatus];
  const isOnPaidPlan = plan !== "free";
  const currentCard = PLAN_CARDS.find((c) => c.plan === plan);

  async function startCheckout(target: BillablePlan) {
    if (pendingPlan) return;
    setPendingPlan(target);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: target }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "checkout_failed");

      const result = await openRazorpayOrder({
        key: body.razorpay_key as string,
        orderId: body.order_id as string,
        name: "wacrm",
        description: `${PLAN_LABELS[target]} — ${t("oneTimeBilling")}`,
        prefill: {
          name: profile?.full_name ?? undefined,
          email: profile?.email ?? undefined,
        },
      });

      if (!result.paid) {
        // User closed/abandoned the modal — nothing to do.
        return;
      }

      // Client callback is not trusted alone — re-verify the payment
      // server-side and let it decide the account's plan.
      const verifyRes = await fetch("/api/billing/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order_id: result.orderId,
          payment_id: result.paymentId,
          signature: result.signature,
        }),
      });
      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) throw new Error(verifyBody?.error ?? "verify_failed");

      await refreshProfile();
      toast.success(t("activated", { plan: PLAN_LABELS[target] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      toast.error(t("checkoutError", { message }));
    } finally {
      setPendingPlan(null);
    }
  }

  async function cancelSubscription() {
    if (cancelling) return;
    if (!window.confirm(t("cancelConfirm"))) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "cancel_failed");
      await refreshProfile();
      toast.success(t("cancelled"));
    } catch {
      toast.error(t("cancelError"));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
      />

      {/* Current plan / subscription health */}
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Crown className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-foreground">
                {PLAN_LABELS[plan]}
              </span>
              <Badge
                variant="outline"
                className={cn("gap-1 text-[10px]", statusMeta.className)}
              >
                {t(statusMeta.labelKey)}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {isOnPaidPlan && currentCard ? currentCard.price : t("freeLine")}
            </p>
          </div>
          {!isOwner ? (
            <p className="shrink-0 text-xs text-muted-foreground">
              {t("ownerOnly")}
            </p>
          ) : isOnPaidPlan && planStatus === "active" ? (
            <Button variant="outline" onClick={cancelSubscription} disabled={cancelling}>
              {cancelling && <Loader2 className="size-4 animate-spin" />}
              {t("cancelButton")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {isOwner ? (
        <>
          {/* Plan picker — upgrade (or re-subscribe) only; downgrades are a
              cancel + a fresh subscription. */}
          <h3 className="mt-8 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-muted-foreground" />
            {t("choosePlan")}
          </h3>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PLAN_CARDS.map((card) => {
              const current = card.plan === plan;
              const billable = card.plan !== "free";
              const busy = pendingPlan === card.plan;
              return (
                <div
                  key={card.plan}
                  className={cn(
                    "flex flex-col rounded-xl border border-border bg-card p-4",
                    card.plan === "pro_max" && "border-primary/50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      {PLAN_LABELS[card.plan]}
                    </span>
                    <Badge
                      variant={card.automation ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {card.ai
                        ? "Automation + AI"
                        : card.automation
                          ? "Automation"
                          : "Core CRM"}
                    </Badge>
                  </div>

                  <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {card.price}
                  </div>
                  <p className="mt-1 min-h-10 text-xs leading-relaxed text-muted-foreground">
                    {card.tagline}
                  </p>

                  <ul className="mt-3 flex flex-col gap-1.5 text-xs">
                    {[
                      { included: card.automation, label: t("featureAutomation") },
                      { included: card.ai, label: t("featureAi") },
                    ].map((row) => (
                      <li key={row.label} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
                            row.included
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {row.included ? (
                            <Check className="size-2.5" />
                          ) : (
                            <X className="size-2.5" />
                          )}
                        </span>
                        <span
                          className={cn(
                            row.included
                              ? "text-foreground"
                              : "text-muted-foreground line-through decoration-muted-foreground/40",
                          )}
                        >
                          {row.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex-1" />
                  <Button
                    variant={card.plan === "pro_max" ? "default" : "outline"}
                    onClick={() => {
                      if (billable) void startCheckout(card.plan as BillablePlan);
                    }}
                    disabled={current || !billable || !!pendingPlan}
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : current ? (
                      t("currentPlan")
                    ) : billable ? (
                      t("choose")
                    ) : (
                      t("currentPlan")
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {t("testModeNote")}
          </p>
        </>
      ) : null}
    </section>
  );
}