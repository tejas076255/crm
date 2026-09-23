// ============================================================
// Account plan helpers — pure, unit-testable, no I/O.
//
// Mirrors the `plan_enum` Postgres type from migration
// 040_subscriptions.sql. The hierarchy is a flat ordinal
// (free=0 < pro=1 < pro_max=2) that matches the same CASE
// expression the `account_has_plan(account_id, min_plan)` SQL
// helper uses, so server-side TypeScript guards and database-side
// RLS speak the same language.
//
// Plan → feature map (the single source of truth):
//   free    — core only (inbox, contacts, pipelines, broadcasts,
//             dashboard, team). No automations, no AI.
//   pro     — core + no-code automations & flows.
//   pro_max — everything, + AI reply assistant / AI Agents.
//
// Predicates (`canAutomate`, `canUseAI`, …) are the single source
// of truth for "what plan unlocks what" — both API route guards and
// UI gates should call them rather than open-coding plan checks.
// ============================================================

export type Plan = "free" | "pro" | "pro_max";

/** Subscription health for an account (migration 040 `plan_status`). */
export type PlanStatus = "none" | "active" | "past_due" | "cancelled";

/** Ordered list of every plan_status value. */
export const PLAN_STATUSES: readonly PlanStatus[] = [
  "none",
  "active",
  "past_due",
  "cancelled",
] as const;

/** Type-narrow an unknown string into a valid `PlanStatus`, or null. */
export function isPlanStatus(value: unknown): value is PlanStatus {
  return (
    typeof value === "string" &&
    (PLAN_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Normalise a possibly-null DB value into a `PlanStatus`, defaulting to
 * 'none'. Mirrors `planFromValue`; a fresh account has never had a
 * subscription, so 'none' is the honest fallback.
 */
export function planStatusFromValue(value: unknown): PlanStatus {
  return isPlanStatus(value) ? value : "none";
}

/** True iff the subscription is live and granting access. */
export function isPlanActive(status: PlanStatus): boolean {
  return status === "active";
}

/** Ordered list of every valid plan, lowest first. */
export const PLANS: readonly Plan[] = ["free", "pro", "pro_max"] as const;

/** Numeric rank of a plan. Higher = more privileged. */
export function planRank(plan: Plan): number {
  switch (plan) {
    case "free":
      return 0;
    case "pro":
      return 1;
    case "pro_max":
      return 2;
  }
}

/** True iff `plan` is at least `min`. */
export function hasMinPlan(plan: Plan, min: Plan): boolean {
  return planRank(plan) >= planRank(min);
}

/** Type-narrow an unknown string into a valid `Plan`. */
export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value);
}

/**
 * Normalise a possibly-null DB value into a `Plan`, defaulting to
 * 'free'. Mirrors how `useAuth`/`getCurrentAccount` narrow optional
 * enum values defensively.
 */
export function planFromValue(value: unknown): Plan {
  return isPlan(value) ? value : "free";
}

// ============================================================
// Capability predicates
//
// Every UI gate and API route guard should call one of these
// instead of comparing plan strings inline. Adding a capability =
// one new predicate here + one call site per consumer.
// ============================================================

/** No-code automations & flows — available on pro and above. */
export function canAutomate(plan: Plan): boolean {
  return hasMinPlan(plan, "pro");
}

/** AI reply assistant / AI Agents — pro_max only. */
export function canUseAI(plan: Plan): boolean {
  return plan === "pro_max";
}

/** Human-readable plan name (for badges / settings). */
export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  pro_max: "Pro Max",
};