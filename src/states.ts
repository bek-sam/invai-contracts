/**
 * State machines shared by every repo. The backend enforces transitions in
 * modules/orders/state-machine.ts using ITEM_TRANSITIONS; the frontends use the
 * same table to decide which actions to show.
 */

/** Production state of one order item (one physical unit; see schemas/orders.ts). */
export const ORDER_ITEM_STATES = [
  "imported",
  "needs_mapping",
  "ready",
  "needs_artwork",
  "on_sheet",
  "transfer_in",
  "pressed",
  "packed",
  "shipped",
  "delivered",
  "on_hold",
  "cancelled",
] as const;
export type OrderItemState = (typeof ORDER_ITEM_STATES)[number];

/** States an item can be held from or cancelled in (architecture.md 3.1: "before shipped"). */
export const PRE_SHIPPED_STATES = [
  "imported",
  "needs_mapping",
  "ready",
  "needs_artwork",
  "on_sheet",
  "transfer_in",
  "pressed",
  "packed",
] as const satisfies readonly OrderItemState[];

export const TERMINAL_ITEM_STATES = [
  "delivered",
  "cancelled",
] as const satisfies readonly OrderItemState[];

/** States that block production until a person acts. */
export const BLOCKED_ITEM_STATES = [
  "needs_mapping",
  "needs_artwork",
  "on_hold",
] as const satisfies readonly OrderItemState[];

/**
 * Allowed transitions, matching architecture.md 3.1 plus on_hold / cancelled from any
 * pre-shipped state. `on_hold -> X` restores the state the item was held from (the backend
 * stores `heldFromState`), which is why every pre-shipped state is listed as a target.
 */
export const ITEM_TRANSITIONS: Record<OrderItemState, readonly OrderItemState[]> = {
  imported: ["needs_mapping", "ready", "on_hold", "cancelled"],
  needs_mapping: ["ready", "on_hold", "cancelled"],
  ready: ["needs_artwork", "on_sheet", "on_hold", "cancelled"],
  needs_artwork: ["ready", "on_hold", "cancelled"],
  on_sheet: ["transfer_in", "on_hold", "cancelled"],
  transfer_in: ["pressed", "on_hold", "cancelled"],
  pressed: ["packed", "ready", "on_hold", "cancelled"], // "ready" = QC fail, reprint
  packed: ["shipped", "on_hold", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  on_hold: [...PRE_SHIPPED_STATES, "cancelled"],
  cancelled: [],
};

export function canTransition(from: OrderItemState, to: OrderItemState): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

/** Order-level status, derived from its items (see deriveOrderStatus). Never stored as truth. */
export const ORDER_STATUSES = [
  "new", // every item imported/ready, nothing in production yet
  "needs_attention", // at least one item needs mapping or artwork
  "in_production", // at least one item on a sheet, in transfer, pressed or packed
  "ready_to_ship", // every open item packed
  "partially_shipped",
  "shipped",
  "delivered",
  "on_hold",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Precedence: cancelled (all) > on_hold (any) > needs_attention (any) > delivered (all) >
 * shipped (all shipped/delivered) > partially_shipped (some) > ready_to_ship (all packed) >
 * in_production (any past ready) > new. Cancelled items are ignored unless all are cancelled.
 */
export function deriveOrderStatus(states: readonly OrderItemState[]): OrderStatus {
  if (states.length === 0) return "new";
  const open = states.filter((s) => s !== "cancelled");
  if (open.length === 0) return "cancelled";
  if (open.some((s) => s === "on_hold")) return "on_hold";
  if (open.some((s) => s === "needs_mapping" || s === "needs_artwork")) return "needs_attention";
  if (open.every((s) => s === "delivered")) return "delivered";
  const done = (s: OrderItemState) => s === "shipped" || s === "delivered";
  if (open.every(done)) return "shipped";
  if (open.some(done)) return "partially_shipped";
  if (open.every((s) => s === "packed")) return "ready_to_ship";
  if (
    open.some((s) => s === "on_sheet" || s === "transfer_in" || s === "pressed" || s === "packed")
  )
    return "in_production";
  return "new";
}

/** Gang sheet lifecycle. `received` means the shop has the transfers (items move to transfer_in). */
export const SHEET_STATES = [
  "building",
  "ready",
  "sent",
  "acknowledged",
  "printed",
  "shipped",
  "received",
  "failed",
  "cancelled",
] as const;
export type SheetState = (typeof SHEET_STATES)[number];

export const SHEET_TRANSITIONS: Record<SheetState, readonly SheetState[]> = {
  building: ["ready", "failed", "cancelled"],
  ready: ["sent", "building", "cancelled"], // building = regenerate
  sent: ["acknowledged", "printed", "cancelled"],
  acknowledged: ["printed", "cancelled"],
  printed: ["shipped", "received"],
  shipped: ["received"],
  received: [],
  failed: ["building", "cancelled"],
  cancelled: [],
};

export const SHIPMENT_STATES = [
  "pending", // created from a packed order, no rates yet
  "rated",
  "labeled",
  "in_transit",
  "delivered",
  "exception",
  "returned",
  "voided",
] as const;
export type ShipmentState = (typeof SHIPMENT_STATES)[number];

export const PO_STATES = [
  "draft",
  "submitted",
  "partially_received",
  "received",
  "cancelled",
  // Added at the end (additive): the PO's supplier call is in flight (crash-safe submit, wave 1/2).
  "submitting",
] as const;
export type PoState = (typeof PO_STATES)[number];

export const LISTING_DRAFT_STATES = [
  "generating",
  "needs_review", // generated, waiting on a person (validation and trademark results attached)
  "approved",
  "rejected",
  "publishing",
  "published",
  "failed",
] as const;
export type ListingDraftState = (typeof LISTING_DRAFT_STATES)[number];

export const JOB_STATES = ["queued", "running", "done", "failed"] as const;
export type JobState = (typeof JOB_STATES)[number];

export const CHANNELS = ["etsy", "amazon", "shopify", "tiktok", "walmart", "ebay", "csv"] as const;
export type Channel = (typeof CHANNELS)[number];

export const STATIONS = ["pick", "press", "qc", "pack", "receiving"] as const;
export type Station = (typeof STATIONS)[number];
