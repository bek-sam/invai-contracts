import { z } from "zod";
import { CHANNELS, SHEET_STATES } from "../states";
import { Id, Timestamp } from "./common";

/** Mirrors architecture.md 10 "alerts that matter to shops" plus operational ones. */
export const ALERT_KINDS = [
  "order_at_risk", // approaching ship-by without a label
  "order_overdue",
  "sync_broken", // a connection failed for 30+ minutes
  "sheet_stuck", // sent to the vendor, no acknowledgement or print within the turnaround
  "stock_low",
  "artwork_flagged",
  "items_need_mapping",
  "tracking_push_failed",
  "plan_limit_reached",
  "ai_credits_low",
  "vendor_sheet_received", // vendor org: a shop sent a sheet
  "qc_fail_spike",
  "ai_spend_cap_tenant", // this company's daily AI spend cap was reached (severity "critical")
  "ai_spend_cap_platform", // the platform-wide daily AI spend cap was reached (severity "critical")
  "queue_failed_spike", // a background queue's failed jobs grew past a threshold in 15 min ("critical")
  "outbox_parked", // an outbox event gave up after its retry budget and needs a redrive ("critical")
  "ai_breaker_fail_open", // the AI spend check could not reach Valkey and let a call through ("critical")
  "ai_summary_breaker", // wave 19: > 10% of digest AI summaries rejected in 24 h, global mode flipped to shadow ("critical")
] as const;

/**
 * 0.11.0 (B-224, wave P5): which sentence an alert's line is. `kind` alone can't say it, because
 * kinds are reused (`tracking_push_failed` covers three stuck shipping intents and two vendor
 * email outcomes, `sync_broken` also covers a stuck PO and a stuck webhook) and
 * `plan_limit_reached` has a "near" and a "reached" line. The web builds the translated line from
 * `messageCode` + `params`; `title`/`message` stay as the English fallback for old rows, old
 * clients and alerts raised outside `src/modules/**` (worker sweeps, AI breaker), which carry no
 * code. Consumers must treat an unknown code like a missing one (a Record lookup with a fallback,
 * never an exhaustive switch), so appending a code later never breaks a cached client.
 */
export const ALERT_MESSAGE_CODES = [
  "order_at_risk",
  "order_overdue",
  "sync_broken",
  "sheet_stuck",
  "stock_low",
  "plan_limit_near",
  "plan_limit_reached",
  "label_buy_stuck",
  "label_void_stuck",
  "tracking_push_stuck",
  "vendor_email_unconfirmed",
  "vendor_email_failed",
  "po_stuck_submitting",
  "webhook_stuck",
] as const;
export const AlertMessageCode = z.enum(ALERT_MESSAGE_CODES);
export type AlertMessageCode = z.infer<typeof AlertMessageCode>;

/**
 * The values a translated alert line needs. Every key is optional; which keys a code uses is
 * `ALERT_MESSAGE_PARAM_KEYS`. Product, shop and supplier words only: no buyer name, address or
 * note ever rides here. Dates are ISO strings formatted by the client in `timeZone`; counts are
 * plain numbers the client pluralizes.
 */
export const AlertParams = z.object({
  /** The shop's order number as shown in the app, e.g. `1042`. */
  orderNo: z.string().max(64).optional(),
  /** The order's ship-by deadline (ISO). */
  shipBy: Timestamp.optional(),
  /** The shop's IANA time zone, e.g. `America/Phoenix`, so dates read as the shop's day (B-137). */
  timeZone: z.string().max(64).optional(),
  /** Whole hours: left until ship-by (order_at_risk) or since the sheet was sent (sheet_stuck). */
  hours: z.number().int().nonnegative().optional(),
  connectionName: z.string().max(120).optional(),
  sheetName: z.string().max(120).optional(),
  sheetStatus: z.enum(SHEET_STATES).optional(),
  /** Blank as the shop reads it, e.g. `Gildan 5000 Black M`. */
  blankName: z.string().max(200).optional(),
  /** Units on hand minus reserved; may be negative when oversold. */
  available: z.number().int().optional(),
  reorderPoint: z.number().int().nonnegative().optional(),
  incoming: z.number().int().nonnegative().optional(),
  /** Percent of the monthly order allowance used, e.g. 92 (a `*Pct` number, not a ratio). */
  usedPct: z.number().nonnegative().optional(),
  used: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional(),
  planName: z.string().max(60).optional(),
  vendorName: z.string().max(120).optional(),
  poNo: z.string().max(64).optional(),
  supplierName: z.string().max(120).optional(),
  channel: z.enum(CHANNELS).optional(),
});
export type AlertParams = z.infer<typeof AlertParams>;

/** The params keys each message code fills (ruling R1, `waves/P5/reviews/plan-architect.md`). */
export const ALERT_MESSAGE_PARAM_KEYS = {
  order_at_risk: ["orderNo", "shipBy", "timeZone", "hours"],
  order_overdue: ["orderNo", "shipBy", "timeZone"],
  sync_broken: ["connectionName"],
  sheet_stuck: ["sheetName", "hours", "sheetStatus"],
  stock_low: ["blankName", "available", "reorderPoint", "incoming"],
  plan_limit_near: ["usedPct", "used", "limit", "planName"],
  plan_limit_reached: ["used", "limit", "planName"],
  label_buy_stuck: [],
  label_void_stuck: [],
  tracking_push_stuck: [],
  vendor_email_unconfirmed: ["sheetName", "vendorName"],
  vendor_email_failed: ["sheetName", "vendorName"],
  po_stuck_submitting: ["poNo", "supplierName"],
  webhook_stuck: ["channel"],
} as const satisfies Record<AlertMessageCode, readonly (keyof AlertParams)[]>;

export const Alert = z.object({
  id: Id,
  kind: z.enum(ALERT_KINDS),
  severity: z.enum(["info", "warning", "critical"]),
  title: z.string(),
  message: z.string(),
  /** Deep link target. */
  entity: z.object({ type: z.string(), id: z.string() }).nullable(),
  readAt: Timestamp.nullable(),
  createdAt: Timestamp,
  /** 0.11.0: which translated line to show; sent together with `params`, or neither. */
  messageCode: AlertMessageCode.optional(),
  /** 0.11.0: the values for the `messageCode` line (keys per `ALERT_MESSAGE_PARAM_KEYS`). */
  params: AlertParams.optional(),
});
export type Alert = z.infer<typeof Alert>;
