import { z } from "zod";
import { Cents, Timestamp } from "./common";
import { PlanKey } from "./tenancy";

export const Plan = z.object({
  key: PlanKey,
  name: z.string(),
  priceMonthly: Cents,
  ordersPerMonth: z.number().int().positive().nullable(), // null = custom / unlimited
  aiCreditsPerMonth: z.number().int().nonnegative(),
  labelFee: Cents, // per label on top of postage
  maxUsers: z.number().int().positive().nullable(),
  maxConnections: z.number().int().positive().nullable(),
});
export type Plan = z.infer<typeof Plan>;

const Meter = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  /** used / limit; null when unlimited. */
  ratio: z.number().min(0).nullable(),
  limitReached: z.boolean(),
});

export const Usage = z.object({
  periodStart: Timestamp,
  periodEnd: Timestamp,
  orders: Meter,
  aiCredits: Meter,
  users: Meter,
  connections: Meter,
  labelsBought: z.number().int().nonnegative(),
  labelFees: Cents,
});
export type Usage = z.infer<typeof Usage>;

export const BillingStatus = z.object({
  plan: Plan,
  usage: Usage,
  /** `trial_expired`: past `trialEndsAt` with no active subscription (wave 2). */
  status: z.enum(["trialing", "active", "past_due", "cancelled", "trial_expired"]),
  trialEndsAt: Timestamp.nullable(),
  /**
   * End of the current billing period Stripe is charging for (wave 2). Optional so the T-2-1
   * implementation can add it without every existing `getStatus` caller changing first; treat a
   * missing value the same as null (no live subscription yet).
   */
  currentPeriodEnd: Timestamp.nullable().optional(),
  /** The subscription is set to cancel at `currentPeriodEnd` instead of renewing (wave 2, optional — see `currentPeriodEnd`). */
  cancelAtPeriodEnd: z.boolean().optional(),
  /** Stripe is stubbed in v1: false means changePlan returns no checkout URL. */
  paymentsEnabled: z.boolean(),
  /** What happens when the order limit is hit. Imports continue; the shop is nagged to upgrade. */
  overLimitBehavior: z.enum(["warn", "block_imports"]),
});
export type BillingStatus = z.infer<typeof BillingStatus>;
