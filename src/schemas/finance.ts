import { z } from "zod";
import { CHANNELS } from "../states";
import { Cents, DateOnly, Id, Period, Timestamp } from "./common";

/** One dated refund/chargeback event; attributes the refund to its own period (not the order's). */
export const RefundEvent = z.object({
  id: Id,
  orderId: Id,
  orderItemId: Id.nullable(), // null = order-level (e.g. shipping refund)
  channel: z.enum(CHANNELS),
  source: z.enum(["shopify", "csv", "manual"]),
  amountCents: Cents,
  feeRecoveredCents: Cents,
  refundedAt: Timestamp,
  note: z.string().nullable(),
  /** Set when a manual refund was voided (entered by mistake); a voided refund counts nowhere. */
  voidedAt: Timestamp.nullable(),
  voidReason: z.string().nullable(),
});
export type RefundEvent = z.infer<typeof RefundEvent>;

export const PROFIT_DIMENSIONS = ["order", "design", "blank", "channel", "day"] as const;
export const ProfitDimension = z.enum(PROFIT_DIMENSIONS);

/** Every cost bucket of the profit formula (platform concept, module 11). All cents. */
export const CostBuckets = z.object({
  revenue: Cents, // item price + shipping charged
  channelFees: Cents,
  blankCost: Cents,
  transferCost: Cents, // sq in × transfer $/sq in
  labelCost: Cents, // postage + label fee
  packagingCost: Cents,
  laborCost: Cents,
  adsCost: Cents, // allocated
  refunds: Cents,
  net: Cents,
  /** net / revenue; null when revenue is 0. */
  marginPct: z.number().nullable(),
});

export const ProfitRow = CostBuckets.extend({
  /** Dimension key: order id, design id, blank style code, channel, or YYYY-MM-DD. */
  key: z.string(),
  label: z.string(),
  orders: z.number().int().nonnegative(),
  units: z.number().int().nonnegative(),
});
export type ProfitRow = z.infer<typeof ProfitRow>;

export const ProfitSummary = z.object({
  dimension: ProfitDimension,
  period: Period,
  rows: z.array(ProfitRow),
  totals: CostBuckets,
  /** Set when some orders in the period have no fee data yet. */
  incomplete: z.boolean(),
  computedAt: Timestamp,
});
export type ProfitSummary = z.infer<typeof ProfitSummary>;

export const OrderProfitLine = CostBuckets.extend({
  orderItemId: Id,
  designName: z.string(),
  blankLabel: z.string(),
  printAreaSqIn: z.number().nonnegative(),
  laborMinutes: z.number().nonnegative(),
  isReprint: z.boolean(),
});

export const OrderProfit = CostBuckets.extend({
  orderId: Id,
  orderNo: z.string(),
  channel: z.enum(CHANNELS),
  placedAt: Timestamp,
  price: Cents, // item subtotal
  shippingCharged: Cents,
  feeBreakdown: z.array(z.object({ label: z.string(), amount: Cents })),
  lines: z.array(OrderProfitLine),
  /** Which costs are estimates (settings) versus actuals (label bought, fees from channel). */
  estimated: z.array(z.enum(["channelFees", "blankCost", "transferCost", "labelCost", "adsCost"])),
});
export type OrderProfit = z.infer<typeof OrderProfit>;

export const ChannelFeeTable = z.object({
  channel: z.enum(CHANNELS),
  transactionPct: z.number().min(0).max(100),
  perOrderCents: Cents.nonnegative(),
  paymentPct: z.number().min(0).max(100),
  paymentFixedCents: Cents.nonnegative(),
  listingFeeCents: Cents.nonnegative(),
});

/** Seeded from CHANNEL_RULES fee defaults; the shop edits them here. */
export const CostSettings = z.object({
  feeTables: z.array(ChannelFeeTable),
  transferCentsPerSqIn: Cents.nonnegative(),
  packagingPerOrder: Cents.nonnegative(),
  laborRatePerHour: Cents.nonnegative(),
  laborMinutesPerItem: z.number().nonnegative(),
  /** How ad spend is spread over orders: by channel revenue share or evenly per order. */
  adsAllocation: z.enum(["revenue_share", "per_order"]),
  updatedAt: Timestamp,
});
export type CostSettings = z.infer<typeof CostSettings>;

export const CostSettingsInput = CostSettings.omit({ updatedAt: true }).partial();

export const AdSpend = z.object({
  id: Id,
  date: DateOnly,
  channel: z.enum(CHANNELS),
  amount: Cents,
  campaign: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: Timestamp,
});
export type AdSpend = z.infer<typeof AdSpend>;

export const AdSpendInput = z.object({
  date: DateOnly,
  channel: z.enum(CHANNELS),
  amount: Cents.nonnegative(),
  campaign: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
});
