import { z } from "zod";
import { STATIONS } from "../states";
import { Cents, DateOnly, Timestamp } from "./common";
import { DigestAction, DigestDetector } from "./digest";

const Count = z.number().int().nonnegative();

/** The command-center summary. One call, refreshed every minute and on realtime events. */
export const TodaySummary = z.object({
  date: DateOnly,
  generatedAt: Timestamp,
  orders: z.object({
    dueToday: Count,
    overdue: Count,
    /** Ship-by within the risk window and not yet packed. */
    atRisk: Count,
    onHold: Count,
    newSinceYesterday: Count,
  }),
  blocked: z.object({
    needsMapping: Count,
    needsArtwork: Count,
  }),
  sheets: z.object({
    ready: Count, // built, not sent
    waitingOnVendor: Count, // sent or acknowledged
    printedNotReceived: Count, // printed or shipped by the vendor
  }),
  stations: z.array(
    z.object({
      station: z.enum(STATIONS),
      itemsWaiting: Count,
      itemsDoneToday: Count,
    }),
  ),
  capacity: z.object({
    /** Items the team can finish today (staff on shift × items/hour × hours left). */
    capacityItems: Count,
    /** Items that must ship today and are not packed. */
    workloadItems: Count,
    itemsPerHour: z.number().nonnegative(),
    hoursLeft: z.number().nonnegative(),
  }),
  shipping: z.object({
    packedUnlabeled: Count,
    labeledToday: Count,
    trackingPushFailed: Count,
  }),
  inventory: z.object({ lowStockCount: Count }),
  alerts: z.object({ unread: Count, critical: Count }),
});
export type TodaySummary = z.infer<typeof TodaySummary>;

/**
 * Today's action panel (0.10.0, `specs/business-analytics-v2.md` AC-E2). Up to 5 ranked actions
 * from the same detectors as the weekly digest (D1..D13), over a fixed window: the 7 days ending
 * yesterday in the shop's time zone, so the set is the same all day.
 *
 * Storage (T-A10 ruling, `waves/A2/reviews/plan-architect.md` 2): a daily `reports` job
 * precomputes the set per shop and date; the read is a SELECT. Heavy work stays in the queue
 * (rule 9) and `recordActionClick` has a stored row to check `key` against.
 */

/** Stable key of one action: the ranked candidate's fingerprint, unique per (shop, date). */
export const TodayActionKey = z.string().min(1).max(128);
export type TodayActionKey = z.infer<typeof TodayActionKey>;

/**
 * One ranked action. `kind`, `params` and `href` are the digest's `DigestAction` (same wording and
 * the same in-app href rule), so web renders it with the digest's copy. `impactCents` is the
 * estimated dollar impact (integer cents, null when the detector has none). `clickedAt` is the
 * caller's own first click, null until then.
 */
export const TodayAction = DigestAction.extend({
  key: TodayActionKey,
  rank: z.number().int().min(1).max(5),
  detector: DigestDetector,
  impactCents: Cents.nullable(),
  clickedAt: Timestamp.nullable(),
});
export type TodayAction = z.infer<typeof TodayAction>;

/**
 * `today.actions`. `generatedAt` null means the set for `date` isn't built yet: the read enqueues
 * the build and answers `actions: []`, `steady: false`, and the web hides the panel. Once built,
 * `steady: true` with no actions is the healthy "Nothing needs attention right now" state.
 */
export const TodayActions = z.object({
  date: DateOnly,
  /** First day of the window (date - 7 days). */
  windowStart: DateOnly,
  /** Last day of the window (date - 1 day), inclusive. */
  windowEnd: DateOnly,
  actions: z.array(TodayAction).max(5),
  steady: z.boolean(),
  generatedAt: Timestamp.nullable(),
});
export type TodayActions = z.infer<typeof TodayActions>;

export const TodayActionsInput = z.object({ date: DateOnly.optional() });
export type TodayActionsInput = z.infer<typeof TodayActionsInput>;

export const TodayActionClickInput = z.object({ date: DateOnly, key: TodayActionKey });
export type TodayActionClickInput = z.infer<typeof TodayActionClickInput>;

/** The stored click. `clickedAt` is the caller's first click: a repeat returns the same value. */
export const TodayActionClick = z.object({
  date: DateOnly,
  key: TodayActionKey,
  clickedAt: Timestamp,
});
export type TodayActionClick = z.infer<typeof TodayActionClick>;
