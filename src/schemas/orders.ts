import { z } from "zod";
import { CHANNELS, ORDER_ITEM_STATES, ORDER_STATUSES, STATIONS } from "../states";
import { Address, Cents, Id, NamedRef, Timestamp } from "./common";
import { PackOverride, REPRINT_REASONS } from "./production";

export const PersonalizationAnswer = z.object({
  question: z.string(),
  answer: z.string().nullable(),
  fileUrl: z.url().nullable(),
});
export type PersonalizationAnswer = z.infer<typeof PersonalizationAnswer>;

/**
 * What every channel adapter produces (architecture.md 4). The core never sees channel
 * payloads. Items still carry `quantity` here; the orders module explodes each unit into
 * its own OrderItem at import so that every shirt has one state and one transfer.
 */
export const NormalizedOrderItem = z.object({
  channelLineId: z.string(),
  channelSku: z.string(),
  channelListingId: z.string().nullable(),
  title: z.string(),
  variantTitle: z.string().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: Cents,
  personalization: z.array(PersonalizationAnswer),
});
export type NormalizedOrderItem = z.infer<typeof NormalizedOrderItem>;

export const NormalizedOrder = z.object({
  channel: z.enum(CHANNELS),
  channelOrderId: z.string(),
  /** Display number as the buyer sees it (Etsy receipt id, Amazon order id, Shopify #1001). */
  orderNo: z.string(),
  placedAt: Timestamp,
  shipBy: Timestamp.nullable(), // null = compute from CHANNEL_RULES / connection settings
  isRush: z.boolean(),
  buyerName: z.string(),
  buyerEmail: z.email().nullable(),
  shipTo: Address.nullable(),
  shippingMethod: z.string().nullable(),
  totals: z.object({
    subtotal: Cents,
    shipping: Cents,
    tax: Cents,
    discount: Cents,
    total: Cents,
  }),
  buyerNote: z.string().nullable(),
  items: z.array(NormalizedOrderItem).min(1),
  /** Channel's own "last modified" timestamp; null = channel has no separate signal (staleness check is skipped). */
  sourceUpdatedAt: Timestamp.nullable(),
});
export type NormalizedOrder = z.infer<typeof NormalizedOrder>;

export const ITEM_FLAG_CODES = [
  "needs_mapping",
  "personalization_missing",
  "artwork_overflow",
  "artwork_typo",
  "artwork_suspicious_chars",
  "artwork_low_dpi",
  "artwork_qa_failed",
  "blank_oversold",
  "address_invalid",
  "reprint",
  "manual_review",
  // Additive (wave 7, T-7-4): the channel tried to change this unit after it was already pressed.
  "channel_edit_after_press",
] as const;

export const ItemFlag = z.object({
  code: z.enum(ITEM_FLAG_CODES),
  severity: z.enum(["info", "warn", "error"]),
  message: z.string(),
  /** Set by a person; cleared flags stay in the timeline but not here. */
  active: z.boolean(),
  createdAt: Timestamp,
});
export type ItemFlag = z.infer<typeof ItemFlag>;

export const ItemArtworkSummary = z.object({
  status: z.enum(["none", "pending", "rendered", "flagged", "approved", "failed", "purged"]),
  fileKey: z.string().nullable(),
  previewKey: z.string().nullable(),
});

/** One physical unit. A channel line with quantity 3 becomes three items (unitNo 1..3). */
export const OrderItem = z.object({
  id: Id,
  orderId: Id,
  orderNo: z.string(),
  lineNo: z.number().int().positive(),
  unitNo: z.number().int().positive(),
  unitsInLine: z.number().int().positive(),
  channelSku: z.string(),
  channelListingId: z.string().nullable(),
  title: z.string(),
  variantTitle: z.string().nullable(),
  unitPrice: Cents,
  personalization: z.array(PersonalizationAnswer),
  state: z.enum(ORDER_ITEM_STATES),
  /** State to restore on release; set while on_hold. */
  heldFromState: z.enum(ORDER_ITEM_STATES).nullable(),
  design: NamedRef.nullable(),
  product: NamedRef.nullable(),
  blank: z
    .object({
      variantId: Id,
      brand: z.string(),
      style: z.string(),
      color: z.string(),
      size: z.string(),
    })
    .nullable(),
  placement: z.string().nullable(),
  artwork: ItemArtworkSummary,
  flags: z.array(ItemFlag),
  isRush: z.boolean(),
  isReprint: z.boolean(),
  transferId: Id.nullable(),
  sheetId: Id.nullable(),
  binCode: z.string().nullable(),
  shipmentId: Id.nullable(),
  shipBy: Timestamp,
  updatedAt: Timestamp,
});
export type OrderItem = z.infer<typeof OrderItem>;

export const OrderTotals = z.object({
  subtotal: Cents,
  shipping: Cents,
  tax: Cents,
  discount: Cents,
  total: Cents,
});

export const HOLD_REASONS = [
  "address_check",
  "buyer_request",
  "artwork_review",
  "out_of_stock",
  "payment",
  "fraud_check",
  "other",
] as const;

export const CANCEL_REASONS = [
  "buyer_request",
  "out_of_stock",
  "fraud",
  "undeliverable_address",
  "duplicate",
  "channel_cancelled",
  "other",
] as const;

export const Order = z.object({
  id: Id,
  channel: z.enum(CHANNELS),
  connectionId: Id,
  channelOrderId: z.string(),
  orderNo: z.string(),
  status: z.enum(ORDER_STATUSES),
  placedAt: Timestamp,
  shipBy: Timestamp,
  shippedAt: Timestamp.nullable(),
  deliveredAt: Timestamp.nullable(),
  isRush: z.boolean(),
  /** Ship-by inside the risk window (default 24h) and not yet labeled, or overdue. */
  atRisk: z.boolean(),
  isOverdue: z.boolean(),
  hasPersonalization: z.boolean(),
  hold: z
    .object({ reason: z.enum(HOLD_REASONS), note: z.string().nullable(), at: Timestamp })
    .nullable(),
  cancel: z
    .object({ reason: z.enum(CANCEL_REASONS), note: z.string().nullable(), at: Timestamp })
    .nullable(),
  /** Set when this order was handed to a lead with units missing (production.packOrder override,
   * decision 0010). Cleared back to null once every non-cancelled unit is really packed. */
  packOverride: PackOverride.nullable(),
  buyerName: z.string(),
  /** Null once purged (30 days after delivery) or for roles without orders.manage. */
  shipTo: Address.nullable(),
  shippingMethod: z.string().nullable(),
  buyerNote: z.string().nullable(),
  totals: OrderTotals,
  itemCount: z.number().int().nonnegative(),
  binCode: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Order = z.infer<typeof Order>;

export const OrderWithItems = Order.extend({ items: z.array(OrderItem) });
export type OrderWithItems = z.infer<typeof OrderWithItems>;

export const TIMELINE_KINDS = [
  "imported",
  "state_changed",
  "mapped",
  "artwork",
  "flag",
  "held",
  "released",
  "cancelled",
  "scan",
  "sheet",
  "qc",
  "reprint",
  "shipment",
  "tracking_pushed",
  "note",
  "sync",
  "address_updated", // NEW: written by orders.updateAddress
] as const;

/**
 * 0.11.0 (B-238, wave P5): the transition reasons the backend writes today, as codes the client
 * translates. Only `state_changed` entries carry one. The backend derives it at read time from the
 * stored reason string (rules in `waves/P5/reviews/plan-architect.md` R1); a free-text or unknown
 * reason gets no code and the client falls back to `message`. A producer that adds a reason adds
 * its code at the end; consumers must treat an unknown code like a missing one (Record lookup with
 * a fallback, never an exhaustive switch).
 */
export const TIMELINE_REASON_CODES = [
  "unknown_sku", // import: no SKU match -> needs_mapping
  "mapped",
  "not_personalized",
  "artwork_uploaded",
  "artwork_approved",
  "artwork_edited",
  "artwork_rerendered",
  "artwork_rendered",
  "artwork_failed",
  "artwork_flagged",
  "on_sheet", // reasonParams.sheetName
  "sheet_received", // reasonParams.sheetName
  "scan_match", // pressed after a matching transfer scan
  "reprint", // reasonParams.reprintReason when it is a known reason
  "qc_fail", // pressed -> ready from QC (seed history)
  "qc_pass",
  "held", // reasonParams.holdReason
  "released",
  "cancelled", // reasonParams.cancelReason
  "tracking_pushed",
  "carrier_accepted",
  "carrier_delivered",
] as const;
export const TimelineReasonCode = z.enum(TIMELINE_REASON_CODES);
export type TimelineReasonCode = z.infer<typeof TimelineReasonCode>;

/** Values for a reason code's line. Every key optional; never buyer text. */
export const TimelineReasonParams = z.object({
  sheetName: z.string().max(120).optional(),
  reprintReason: z.enum(REPRINT_REASONS).optional(),
  holdReason: z.enum(HOLD_REASONS).optional(),
  cancelReason: z.enum(CANCEL_REASONS).optional(),
});
export type TimelineReasonParams = z.infer<typeof TimelineReasonParams>;

export const TimelineEntry = z.object({
  id: Id,
  at: Timestamp,
  kind: z.enum(TIMELINE_KINDS),
  orderItemId: Id.nullable(),
  actor: z.object({
    userId: Id.nullable(),
    name: z.string(),
    station: z.enum(STATIONS).nullable(),
  }),
  from: z.enum(ORDER_ITEM_STATES).nullable(),
  to: z.enum(ORDER_ITEM_STATES).nullable(),
  message: z.string(),
  meta: z.record(z.string(), z.unknown()),
  /** 0.11.0: the transition reason as a code (state_changed entries only); absent when unknown. */
  reasonCode: TimelineReasonCode.optional(),
  /** 0.11.0: values for the `reasonCode` line, e.g. `{ sheetName: "S-12" }`. */
  reasonParams: TimelineReasonParams.optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntry>;

export const OrderCounts = z.object({
  byStatus: z.record(z.enum(ORDER_STATUSES), z.number().int().nonnegative()),
  byChannel: z.record(z.enum(CHANNELS), z.number().int().nonnegative()),
  atRisk: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  dueToday: z.number().int().nonnegative(),
});

export const ChannelPerformance = z.object({
  channel: z.enum(CHANNELS),
  connectionId: Id.nullable(),
  orders: z.number().int().nonnegative(),
  shipped: z.number().int().nonnegative(),
  late: z.number().int().nonnegative(),
  lateRate: z.number().min(0).max(1),
  validTrackingRate: z.number().min(0).max(1),
  onTimeTarget: z.number().min(0).max(1).nullable(),
  validTrackingTarget: z.number().min(0).max(1).nullable(),
  meetsTargets: z.boolean(),
  avgHoursToShip: z.number().nonnegative().nullable(),
});
export type ChannelPerformance = z.infer<typeof ChannelPerformance>;
