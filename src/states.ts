/** Production state of one order item. Transitions live in invai-backend (orders module). */
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

export const CHANNELS = ["etsy", "amazon", "shopify", "tiktok", "walmart", "ebay", "csv"] as const;
export type Channel = (typeof CHANNELS)[number];

export const STATIONS = ["pick", "press", "qc", "pack"] as const;
export type Station = (typeof STATIONS)[number];
