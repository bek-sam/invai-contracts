import { z } from "zod";
import { STATIONS } from "../states";
import { DateOnly, Timestamp } from "./common";

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
