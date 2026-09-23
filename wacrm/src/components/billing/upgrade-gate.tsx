"use client";

// ============================================================
// UpgradeGate — rendered in place of a locked feature surface
// (Automations/Flows = pro, AI Agents = pro_max) when the current
// account's plan doesn't unlock it. Mirrors the server-side
// `requirePlan` gate so deep links land on an explanation + an
// upgrade CTA instead of a bare 403.
// ============================================================

import Link from "next/link";
import { Crown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import type { Plan } from "@/lib/auth/plans";
import { PLAN_LABELS } from "@/lib/auth/plans";

const REQUIRE_TITLE: Partial<Record<Plan, string>> = {
  pro: "Automations & flows",
  pro_max: "AI Agents",
};

export function UpgradeGate({ requires }: { requires: "pro" | "pro_max" }) {
  const { plan } = useAuth();

  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Crown className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {REQUIRE_TITLE[requires]}{" "}
            {requires === "pro" ? "are" : "is"} a{" "}
            {PLAN_LABELS[requires]} plan feature
          </h2>
          <p className="text-sm text-muted-foreground">
            Your account is on the{" "}
            <span className="font-medium text-foreground">
              {PLAN_LABELS[plan]}
            </span>{" "}
            plan. Upgrade to unlock it instantly.
          </p>
        </div>
        <Button render={<Link href="/settings?tab=billing" />}>
          <Sparkles className="size-4" data-icon="inline-start" />
          Upgrade plan
        </Button>
      </CardContent>
    </Card>
  );
}