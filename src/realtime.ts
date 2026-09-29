import { z } from "zod";
import { Id, Timestamp } from "./schemas/common";
import { WeekKey } from "./schemas/digest";
import {
  JOB_STATES,
  ORDER_ITEM_STATES,
  ORDER_STATUSES,
  SHEET_STATES,
  SHIPMENT_STATES,
  STATIONS,
} from "./states";

/**
 * Server-Sent Events pushed to browsers and tablets (architecture.md 6). Served at
 * REALTIME_SSE_PATH by the api process from Redis pub/sub, scoped to the caller's org.
 * `Last-Event-ID` replays from the Redis stream after a reconnect. Separate from the
 * outbox `Events`: these are what a UI needs to refresh, not what workers react to.
 *
 * Wire format: `event: <name>`, `id: <envelope.id>`, `data: <JSON RealtimeEnvelope>`.
 */
export const REALTIME_SSE_PATH = "/events";

export const RealtimeEvents = {
  "order.updated": z.object({ orderId: Id, status: z.enum(ORDER_STATUSES), atRisk: z.boolean() }),
  "order.imported": z.object({
    orderId: Id,
    orderNo: z.string(),
    channel: z.string(),
    itemCount: z.number().int(),
  }),
  "item.state_changed": z.object({
    orderItemId: Id,
    orderId: Id,
    from: z.enum(ORDER_ITEM_STATES),
    to: z.enum(ORDER_ITEM_STATES),
    station: z.enum(STATIONS).nullable(),
  }),
  "item.flagged": z.object({ orderItemId: Id, orderId: Id, codes: z.array(z.string()) }),
  "artwork.rendered": z.object({
    orderItemId: Id,
    status: z.enum(["rendered", "flagged", "failed"]),
  }),
  "sheet.status_changed": z.object({
    sheetId: Id,
    from: z.enum(SHEET_STATES),
    to: z.enum(SHEET_STATES),
  }),
  /** Echo of a scan result to every tablet on the same station (e.g. a second screen). */
  "scan.result": z.object({
    clientScanId: Id,
    stationId: Id.nullable(),
    station: z.enum(STATIONS),
    ok: z.boolean(),
    orderItemId: Id.nullable(),
    orderNo: z.string().nullable(),
    mismatch: z.string().nullable(),
  }),
  "queue.changed": z.object({ station: z.enum(STATIONS), waiting: z.number().int() }),
  "bin.changed": z.object({ code: z.string(), orderId: Id.nullable() }),
  /**
   * B-35: a station's maintenance window opened or closed. Web refreshes the stations screen
   * (`invai-web/src/lib/realtime.ts` `keysForEvent` needs a case; `default: []` until then).
   * Tablets poll `production.maintenance.list` instead; the floor never subscribes to SSE.
   */
  "station.maintenance_changed": z.object({ stationId: Id, open: z.boolean() }),
  "shipment.updated": z.object({ shipmentId: Id, orderId: Id, status: z.enum(SHIPMENT_STATES) }),
  "stock.low": z.object({
    blankVariantId: Id,
    available: z.number().int(),
    reorderPoint: z.number().int(),
  }),
  "stock.changed": z.object({ blankVariantId: Id, locationId: Id, available: z.number().int() }),
  "job.progress": z.object({
    jobId: Id,
    kind: z.string(),
    status: z.enum(JOB_STATES),
    progress: z.number().min(0).max(1),
    message: z.string().nullable(),
    resultIds: z.array(Id),
  }),
  "import.completed": z.object({
    importId: Id,
    connectionId: Id,
    ordersImported: z.number().int(),
    rowsFailed: z.number().int(),
  }),
  "connection.health": z.object({ connectionId: Id, ok: z.boolean() }),
  "listing_draft.updated": z.object({ draftId: Id, status: z.string() }),
  "alert.created": z.object({
    alertId: Id,
    kind: z.string(),
    severity: z.enum(["info", "warning", "critical"]),
    title: z.string(),
  }),
  "today.changed": z.object({ reason: z.string() }),
  /** Vendor portal: a shop sent a sheet. */
  "vendor.sheet_received": z.object({ sheetId: Id, shopName: z.string() }),
  /**
   * Wave 19: a digest for `weekKey` is `ready`; the web refreshes `digest.*` and the Today card
   * (`invai-web/src/lib/realtime.ts` `keysForEvent`, T-19-5). Scoped to the caller's org by the
   * SSE stream, so no company id in the payload. The floor never subscribes to it.
   */
  "digest.ready": z.object({ digestId: Id, weekKey: WeekKey }),
} as const;

export type RealtimeEventName = keyof typeof RealtimeEvents;
export type RealtimePayload<E extends RealtimeEventName> = z.infer<(typeof RealtimeEvents)[E]>;

export const RealtimeEnvelope = z.object({
  id: z.string(), // Redis stream id, also the SSE id for replay
  name: z.string(),
  at: Timestamp,
  payload: z.record(z.string(), z.unknown()),
});
export type RealtimeEnvelope = z.infer<typeof RealtimeEnvelope>;

/** Parse an SSE message into a typed event, or null when the name is unknown/invalid. */
export function parseRealtimeEvent<E extends RealtimeEventName>(
  name: E,
  data: unknown,
): RealtimePayload<E> | null {
  const schema = RealtimeEvents[name];
  const result = schema.safeParse(data);
  return result.success ? (result.data as RealtimePayload<E>) : null;
}
