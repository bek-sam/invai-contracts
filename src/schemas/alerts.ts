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
  "ai_spend_cap_tenant", // this company's daily AI spend cap was reached (severity "critical")
  "ai_spend_cap_platform", // the platform-wide daily AI spend cap was reached (severity "critical")
  "queue_failed_spike", // a background queue's failed jobs grew past a threshold in 15 min ("critical")
  "outbox_parked", // an outbox event gave up after its retry budget and needs a redrive ("critical")
  "ai_breaker_fail_open", // the AI spend check could not reach Valkey and let a call through ("critical")
  "ai_summary_breaker", // wave 19: > 10% of digest AI summaries rejected in 24 h, global mode flipped to shadow ("critical")
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
