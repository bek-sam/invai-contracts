import { type ErrorMap, oc } from "@orpc/contract";
import { z } from "zod";
import type { Permission } from "../roles";
import { ORDER_ITEM_STATES } from "../states";

/**
 * Who may call a procedure.
 * - `user`: a Better Auth session (web app). Default.
 * - `floor`: a user session OR a floor session (tablet after PIN login).
 * - `station`: a station token only (the PIN login itself).
 * - `public`: no auth.
 */
export type AuthMode = "user" | "floor" | "station" | "public";

export interface ProcedureMeta {
  /** Checked against ROLE_PERMISSIONS[role]. "none" skips the check (auth mode still applies). */
  permission: Permission | "none";
  auth?: AuthMode;
  /** Backend writes an audit row for every call (defaults to true for mutations). */
  audit?: boolean;
}

/** Errors every procedure may throw. Domain procedures add their own with `.errors()`. */
export const COMMON_ERRORS = {
  UNAUTHORIZED: { status: 401, message: "Sign in required" },
  FORBIDDEN: {
    status: 403,
    message: "Missing permission",
    data: z.object({ permission: z.string() }),
  },
  NOT_FOUND: { status: 404, message: "Not found" },
  CONFLICT: { status: 409, message: "Conflict" },
  INVALID_TRANSITION: {
    status: 409,
    message: "State transition not allowed",
    data: z.object({
      entity: z.enum(["order_item", "sheet", "shipment", "purchase_order", "listing_draft"]),
      id: z.string(),
      from: z.string(),
      to: z.string(),
    }),
  },
  PLAN_LIMIT_REACHED: {
    status: 402,
    message: "Plan limit reached",
    data: z.object({
      meter: z.enum(["orders", "aiCredits", "users", "connections"]),
      used: z.number(),
      limit: z.number(),
    }),
  },
  /** A paid action while there's no active subscription: trial expired, past due, or cancelled (wave 2). */
  PAYMENT_REQUIRED: {
    status: 402,
    message: "This needs an active plan",
    data: z.object({ checkoutUrl: z.url().nullable() }),
  },
  /** A paid action (label buy, checkout, portal) before the account's email is verified (wave 2). */
  EMAIL_NOT_VERIFIED: {
    status: 403,
    message: "Verify your email first",
  },
  /**
   * A real-money action (Stripe checkout or portal, a paid plan) inside a sample workspace
   * (tenancy.demo). Nothing was charged; the caller should say so and point back to the real
   * shop (wave 6, T-6-5).
   */
  DEMO_MODE: {
    status: 403,
    message: "This is a sample shop: nothing here can be paid for",
  },
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests",
    data: z.object({ retryAfterSec: z.number() }),
  },
  UPSTREAM_FAILED: {
    status: 502,
    message: "An external service failed",
    data: z.object({ service: z.string(), detail: z.string().nullable() }),
  },
} satisfies ErrorMap;

/** Every procedure starts here: `proc("orders.read").route(...).input(...).output(...)`. */
export const base = oc.$meta<ProcedureMeta>({ permission: "none" }).errors(COMMON_ERRORS);

export function proc(
  permission: Permission | "none",
  opts: Omit<ProcedureMeta, "permission"> = {},
) {
  return base.meta({ permission, ...opts });
}

export const ItemStateFilter = z.array(z.enum(ORDER_ITEM_STATES)).optional();
