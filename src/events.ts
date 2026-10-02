import { z } from "zod";
import { Id, Timestamp } from "./schemas/common";
import { WeekKey } from "./schemas/digest";
import { ORDER_ITEM_STATES, SHEET_STATES, SHIPMENT_STATES, STATIONS } from "./states";

const ItemState = z.enum(ORDER_ITEM_STATES);

/**
 * Outbox events (architecture.md 3.2): written in the same DB transaction as the change,
 * relayed to BullMQ by the worker. Payloads carry ids, never buyer PII. One entry per
 * module's key events from architecture.md section 3. Realtime (SSE) events for the
 * browsers are a separate map in realtime.ts.
 */
export const Events = {
  // tenancy
  "company.created": z.object({ orgId: Id, type: z.enum(["shop", "vendor"]) }),
  // Payload changed wave 2: nothing emits or consumes this event yet (checked all 8 repos), so
  // `userId` (no user exists until the invite is accepted) is replaced with `invitationId`.
  "user.invited": z.object({ orgId: Id, invitationId: Id }),
  // catalog
  "design.updated": z.object({ designId: Id, qaRequested: z.boolean() }),
  "design.qa_completed": z.object({ designId: Id, status: z.enum(["passed", "warn", "failed"]) }),
  // channels
  "connection.connected": z.object({ connectionId: Id }),
  "connection.sync_failed": z.object({ connectionId: Id, error: z.string() }),
  "import.completed": z.object({ importId: Id, connectionId: Id, orderIds: z.array(Id) }),
  "sku_rule.learned": z.object({ ruleId: Id, channelSku: z.string() }),
  // orders
  "order.imported": z.object({ orderId: Id, connectionId: Id, itemIds: z.array(Id) }),
  "order.updated": z.object({ orderId: Id }),
  "order.held": z.object({ orderId: Id, reason: z.string() }),
  "order.released": z.object({ orderId: Id }),
  "order.cancelled": z.object({
    orderId: Id,
    orderItemIds: z.array(Id),
    scrappedTransferIds: z.array(Id),
  }),
  "item.state_changed": z.object({
    orderItemId: Id,
    orderId: Id,
    from: ItemState,
    to: ItemState,
    station: z.enum(STATIONS).nullable(),
    userId: Id.nullable(),
  }),
  "item.needs_mapping": z.object({ orderItemId: Id, channelSku: z.string() }),
  "item.mapped": z.object({
    orderItemIds: z.array(Id),
    designId: Id,
    blankVariantId: Id,
    ruleId: Id.nullable(),
  }),
  "item.ready": z.object({ orderItemId: Id }),
  // personalization
  "artwork.rendered": z.object({ orderItemId: Id, fileKey: z.string() }),
  "artwork.flagged": z.object({ orderItemId: Id, codes: z.array(z.string()) }),
  "artwork.approved": z.object({ orderItemId: Id, userId: Id }),
  // production
  "batch.requested": z.object({ batchId: Id, jobId: Id, orderItemIds: z.array(Id) }),
  "sheet.built": z.object({ sheetId: Id, batchId: Id, transferIds: z.array(Id) }),
  "sheet.build_failed": z.object({ sheetId: Id.nullable(), batchId: Id, error: z.string() }),
  "sheet.status_changed": z.object({
    sheetId: Id,
    from: z.enum(SHEET_STATES),
    to: z.enum(SHEET_STATES),
  }),
  "sheet.sent": z.object({
    sheetId: Id,
    vendorConnectionId: Id,
    delivery: z.enum(["portal", "email"]),
  }),
  "sheet.received": z.object({ sheetId: Id, orderItemIds: z.array(Id) }),
  "scan.recorded": z.object({
    scanId: Id,
    clientScanId: Id,
    station: z.enum(STATIONS),
    stationId: Id.nullable(),
    ok: z.boolean(),
    orderItemId: Id.nullable(),
  }),
  "item.pressed": z.object({ orderItemId: Id, transferId: Id, userId: Id.nullable() }),
  "item.qc_failed": z.object({ orderItemId: Id, reprintId: Id, reason: z.string() }),
  "item.packed": z.object({ orderItemId: Id, orderId: Id, orderComplete: z.boolean() }),
  "reprint.requested": z.object({ reprintId: Id, orderItemId: Id, reason: z.string() }),
  /** A station maintenance window opened (`open: true`) or closed (B-35, T-22-4); capacity and Today can subscribe. */
  "station.maintenance_changed": z.object({
    stationId: Id,
    maintenanceId: Id,
    open: z.boolean(),
    reason: z.string(),
  }),
  // vendors
  "sheet.acknowledged": z.object({ sheetId: Id, vendorOrgId: Id }),
  "sheet.printed": z.object({ sheetId: Id, vendorOrgId: Id }),
  "sheet.shipped": z.object({ sheetId: Id, vendorOrgId: Id, trackingCode: z.string() }),
  "vendor.invited": z.object({ vendorConnectionId: Id, email: z.string() }),
  // inventory
  "stock.movement": z.object({
    movementId: Id,
    blankVariantId: Id,
    locationId: Id,
    kind: z.string(),
    qty: z.number().int(),
  }),
  "stock.low": z.object({
    blankVariantId: Id,
    locationId: Id,
    available: z.number().int(),
    reorderPoint: z.number().int(),
  }),
  "stock.availability_changed": z.object({ blankVariantIds: z.array(Id) }),
  "po.submitted": z.object({ purchaseOrderId: Id, supplier: z.string() }),
  "po.received": z.object({ purchaseOrderId: Id, complete: z.boolean(), movementIds: z.array(Id) }),
  // shipping
  "shipment.labeled": z.object({
    shipmentId: Id,
    orderId: Id,
    trackingCode: z.string(),
    carrier: z.string(),
  }),
  "shipment.status_changed": z.object({
    shipmentId: Id,
    from: z.enum(SHIPMENT_STATES),
    to: z.enum(SHIPMENT_STATES),
  }),
  "shipment.delivered": z.object({ shipmentId: Id, orderId: Id, deliveredAt: Timestamp }),
  "shipment.voided": z.object({ shipmentId: Id, orderId: Id }),
  "tracking.pushed": z.object({ shipmentId: Id, connectionId: Id }),
  "tracking.push_failed": z.object({
    shipmentId: Id,
    connectionId: Id,
    error: z.string(),
    attempts: z.number().int(),
  }),
  // finance
  "profit.recomputed": z.object({ orderIds: z.array(Id), jobId: Id.nullable() }),
  "cost_settings.changed": z.object({ userId: Id }),
  // ai
  "listing_draft.ready": z.object({ draftId: Id, designId: Id, channel: z.string() }),
  "listing_draft.approved": z.object({ draftId: Id, userId: Id }),
  "listing_draft.published": z.object({ draftId: Id, listingId: z.string() }),
  "listing_draft.failed": z.object({ draftId: Id, error: z.string() }),
  "credits.consumed": z.object({
    entryId: Id,
    credits: z.number().int(),
    remaining: z.number().int(),
  }),
  // billing
  "plan.changed": z.object({ orgId: Id, plan: z.string() }),
  "plan.limit_reached": z.object({
    orgId: Id,
    meter: z.string(),
    used: z.number().int(),
    limit: z.number().int(),
  }),
  // alerts
  "alert.created": z.object({ alertId: Id, kind: z.string(), severity: z.string() }),
  // digest (wave 19): published when a digest is stored `ready`; the delivery job and the Today
  // card hang off it. The envelope's `orgId` carries the company, as for every other event.
  "digest.ready": z.object({ digestId: Id, weekKey: WeekKey }),
  // listing photos (wave 26/27, ADR 0023): the set is created in the request, each composition
  // renders in its own job; `completed` fires once every image is rendered or failed.
  "photo_set.created": z.object({ setId: Id, designId: Id, compositionIds: z.array(Id) }),
  "photo_set.completed": z.object({ setId: Id, status: z.enum(["ready", "failed"]) }),
} as const;

export type EventName = keyof typeof Events;
export type EventPayload<E extends EventName> = z.infer<(typeof Events)[E]>;

/** Envelope stored in outbox_events and delivered to BullMQ. */
export const OutboxEvent = z.object({
  id: Id,
  orgId: Id,
  name: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: Timestamp,
});
export type OutboxEvent = z.infer<typeof OutboxEvent>;
