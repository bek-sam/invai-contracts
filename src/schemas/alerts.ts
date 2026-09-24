import { z } from "zod";
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
] as const;

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
});
export type Alert = z.infer<typeof Alert>;
