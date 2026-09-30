import { z } from "zod";
import { CHANNELS, ORDER_ITEM_STATES } from "../states";
import { SUPPLIERS } from "./catalog";
import { Cents, DateOnly, Id, Period, Ratio, Timestamp } from "./common";
import { TrendClass } from "./market";
import { REPRINT_REASONS } from "./production";

/*
 * Business analytics v2 (wave A1, T-A2, spec `specs/business-analytics-v2.md`). Read-only shapes
 * over data the shop already has; every number implements a definition in
 * `invai-docs/metrics/definitions/` and the field names below follow those definitions.
 *
 * Rules every shape here follows (spec §5):
 * - money is integer cents, percents are `*Pct` numbers (6.5), shares are 0..1 ratios;
 * - a percent below its definition's minimum sample is `null`, and the count that failed the
 *   minimum sits next to it (rule 2: "counts next to every percent"). Analytics reads never throw
 *   for a business outcome ("not enough data" is a value, not an error);
 * - estimates are marked (`estimatedShare`, `estimated`), so a screen can say so;
 * - no buyer PII: rows carry the shop's own order numbers, ids and numbers only. `destZone` is a
 *   carrier zone (1..9), never an address or ZIP.
 * - range procedures take the shared `Period {from, to}` (same as `finance.profit`, so AC-G1
 *   parity is checkable); snapshot procedures take `days` or `asOf`.
 */

/** `sku` is a blank variant (style × color × size), the finest grain a shop reorders at. */
export const ANALYTICS_DIMENSIONS = ["order", "design", "blank", "sku", "channel"] as const;
export const AnalyticsDimension = z.enum(ANALYTICS_DIMENSIONS);
export type AnalyticsDimension = z.infer<typeof AnalyticsDimension>;

/** The cost lines of the contribution ladder, named as `CostBuckets` keys so a backend maps 1:1. */
export const ANALYTICS_COST_LINES = [
  "channelFees",
  "blankCost",
  "transferCost",
  "labelCost",
  "packagingCost",
  "laborCost",
  "adsCost",
  "refunds",
] as const;
export const AnalyticsCostLine = z.enum(ANALYTICS_COST_LINES);
export type AnalyticsCostLine = z.infer<typeof AnalyticsCostLine>;

const Count = z.number().int().nonnegative();
const Channel = z.enum(CHANNELS);

// ---------------------------------------------------------------------------------------------
// unitEconomics (contribution_margin.md)

/**
 * The CM ladder for one row: CM1 after product costs, CM2 after fulfilment, CM3 after ads (CM3
 * equals the Profit page's Net for the same filters). `*Pct` is CM ÷ revenue; null when revenue
 * is 0 or `units` < 30 (the definition's minimum sample), so the screen shows cents and counts.
 */
export const ContributionLadder = z.object({
  revenue: Cents,
  cm1: Cents,
  cm2: Cents,
  cm3: Cents,
  cm1Pct: z.number().nullable(),
  cm2Pct: z.number().nullable(),
  cm3Pct: z.number().nullable(),
  orders: Count,
  units: Count,
  /** Share of units (0..1) whose blank, transfer, label or ads bucket is an estimate. */
  estimatedShare: Ratio,
});
export type ContributionLadder = z.infer<typeof ContributionLadder>;

export const UnitEconomicsRow = ContributionLadder.extend({
  /** Dimension key: order id, design id, blank style code, blank variant id, or channel. */
  key: z.string(),
  label: z.string(),
});
export type UnitEconomicsRow = z.infer<typeof UnitEconomicsRow>;

export const UnitEconomicsInput = z.object({
  period: Period,
  dimension: AnalyticsDimension,
  channel: Channel.optional(),
  limit: z.number().int().min(1).max(500).default(200),
});
export type UnitEconomicsInput = z.input<typeof UnitEconomicsInput>;

export const UnitEconomics = z.object({
  period: Period,
  dimension: AnalyticsDimension,
  rows: z.array(UnitEconomicsRow),
  totals: ContributionLadder,
  /** Orders in the period with no profit line yet: shown as a banner, never a silent partial total (AC-A7). */
  ordersWithoutProfitLine: Count,
  computedAt: Timestamp,
});
export type UnitEconomics = z.infer<typeof UnitEconomics>;

// ---------------------------------------------------------------------------------------------
// losingOrders (losing_order_rate.md)

export const LosingOrder = z.object({
  orderId: Id,
  /** The shop's own order number: allowed on the shop's own screen, not buyer PII. */
  orderNo: z.string(),
  channel: Channel,
  placedAt: Timestamp,
  /** The design with the most units on the order; null when no unit is mapped yet. */
  designId: Id.nullable(),
  designName: z.string().nullable(),
  units: Count,
  revenue: Cents,
  /** Negative by definition of this list. */
  cm2: Cents,
  largestCostLine: AnalyticsCostLine,
  largestCostLineCents: Cents,
  /** Any bucket on the order is an estimate (a small loss is then uncertain). */
  estimated: z.boolean(),
});
export type LosingOrder = z.infer<typeof LosingOrder>;

export const LosingOrdersInput = z.object({
  period: Period,
  channel: Channel.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type LosingOrdersInput = z.input<typeof LosingOrdersInput>;

export const LosingOrders = z.object({
  period: Period,
  /** Worst first (most negative CM2), at most `limit`. */
  orders: z.array(LosingOrder),
  /** All losing orders in the period, not only the ones returned. */
  losingOrders: Count,
  /** Orders in the period with at least one profit line (the rate's denominator). */
  ordersWithProfitLine: Count,
  /** losingOrders ÷ ordersWithProfitLine × 100; null below 30 orders. */
  losingPct: z.number().nullable(),
  /** Sum of negative CM2 (negative or 0). */
  lossCents: Cents,
  ordersWithoutProfitLine: Count,
});
export type LosingOrders = z.infer<typeof LosingOrders>;

// ---------------------------------------------------------------------------------------------
// leakage (revenue_leakage.md)

/** Waterfall steps in display order, from gross sales down to contribution. */
export const LEAKAGE_COMPONENTS = [
  "discounts",
  "fees",
  "refunds",
  "shippingLoss",
  "reprints",
] as const;
export const LeakageComponent = z.enum(LEAKAGE_COMPONENTS);
export type LeakageComponent = z.infer<typeof LeakageComponent>;

export const LeakageStep = z.object({
  component: LeakageComponent,
  cents: Cents,
  /** cents ÷ grossSales × 100; null when grossSales is 0. */
  pctOfGross: z.number().nullable(),
});
export type LeakageStep = z.infer<typeof LeakageStep>;

export const LeakageInput = z.object({
  period: Period,
  channel: Channel.optional(),
});
export type LeakageInput = z.input<typeof LeakageInput>;

export const Leakage = z.object({
  period: Period,
  /** Subtotal + shipping charged, orders with a profit line only. */
  grossSales: Cents,
  waterfall: z.array(LeakageStep),
  /** grossSales − Σ waterfall. */
  remaining: Cents,
  /** Σ waterfall ÷ grossSales × 100; null when grossSales is 0 or `orders` < 30. */
  leakagePct: z.number().nullable(),
  orders: Count,
  ordersWithoutProfitLine: Count,
});
export type Leakage = z.infer<typeof Leakage>;

// ---------------------------------------------------------------------------------------------
// shippingMargin (shipping_margin.md)

/** `zone` rows come only from shipments with `destZone` set (T-A4 fills it at label time). */
export const SHIPPING_MARGIN_GROUPS = ["channel", "service", "weightBand", "zone"] as const;
export const ShippingMarginGroup = z.enum(SHIPPING_MARGIN_GROUPS);
export type ShippingMarginGroup = z.infer<typeof ShippingMarginGroup>;

export const ShippingMarginTotals = z.object({
  /** Orders with at least one non-voided InvAI label in the period (by `labeledAt`). */
  labeledOrders: Count,
  /** Shipping charged to the buyer on those orders. */
  charged: Cents,
  /** Postage + label fee over their non-voided labels. */
  labelCost: Cents,
  /** charged − labelCost. */
  margin: Cents,
  /** margin ÷ labeledOrders; null when labeledOrders is 0. */
  marginPerOrder: Cents.nullable(),
  /** Orders with shipping charged = 0: the item price carries the shipping. */
  freeShippingOrders: Count,
});
export type ShippingMarginTotals = z.infer<typeof ShippingMarginTotals>;

export const ShippingMarginRow = ShippingMarginTotals.extend({
  /** Group key: channel, `carrier/service`, weight band (`0-4oz`), or zone (`1`..`9`). */
  key: z.string(),
  label: z.string(),
});
export type ShippingMarginRow = z.infer<typeof ShippingMarginRow>;

export const ShippingMarginInput = z.object({
  period: Period,
  groupBy: ShippingMarginGroup,
  channel: Channel.optional(),
});
export type ShippingMarginInput = z.input<typeof ShippingMarginInput>;

export const ShippingMargin = z.object({
  period: Period,
  groupBy: ShippingMarginGroup,
  rows: z.array(ShippingMarginRow),
  totals: ShippingMarginTotals,
  /**
   * For `groupBy: zone`: labeled orders whose shipments carry no `destZone` (labeled before T-A4),
   * left out of rows. Counts orders, the unit of every grouping's rows; the name stays for
   * compatibility (0.10.0 text fix, no shape change). Otherwise 0.
   */
  shipmentsWithoutZone: Count,
});
export type ShippingMargin = z.infer<typeof ShippingMargin>;

// ---------------------------------------------------------------------------------------------
// profitBridge (profit_bridge.md)

export const PROFIT_BRIDGE_BY = ["design", "channel", "costLine"] as const;
export const ProfitBridgeBy = z.enum(PROFIT_BRIDGE_BY);
export type ProfitBridgeBy = z.infer<typeof ProfitBridgeBy>;

export const ProfitBridgeMover = z.object({
  /** design id, channel, or an `ANALYTICS_COST_LINES` value, per `by`. */
  key: z.string(),
  label: z.string(),
  baseCm3: Cents,
  currentCm3: Cents,
  /** currentCm3 − baseCm3 = volumePart + ratePart, exactly. */
  change: Cents,
  volumePart: Cents,
  ratePart: Cents,
  baseUnits: Count,
  currentUnits: Count,
});
export type ProfitBridgeMover = z.infer<typeof ProfitBridgeMover>;

export const ProfitBridgeInput = z.object({
  period: Period,
  /** Defaults to the equal-length period ending where `period` starts. */
  basePeriod: Period.optional(),
  by: ProfitBridgeBy.default("design"),
  channel: Channel.optional(),
});
export type ProfitBridgeInput = z.input<typeof ProfitBridgeInput>;

export const ProfitBridge = z.object({
  period: Period,
  /** The base period actually used (the default resolved). */
  basePeriod: Period,
  by: ProfitBridgeBy,
  baseCm3: Cents,
  currentCm3: Cents,
  /** currentCm3 − baseCm3 = volumePart + ratePart, exactly (no residual). */
  totalChange: Cents,
  /** "Sold more or fewer": Σ (u1 − u0) × cm0/u0 over the rows. */
  volumePart: Cents,
  /** "Each sale earned more or less": the rest. */
  ratePart: Cents,
  /**
   * Refund events are dated by refund, not by sale, so they sit outside the per-row bridge: the
   * change in dated refunds between the two periods, shown as its own line. Not part of `totalChange`.
   */
  refundsChange: Cents,
  /** Largest |change| first, at most 10. */
  topMovers: z.array(ProfitBridgeMover).max(10),
  baseOrders: Count,
  currentOrders: Count,
  /** Both periods have ≥ 20 orders; else the screen says "not enough orders to explain". */
  hasEnoughOrders: z.boolean(),
});
export type ProfitBridge = z.infer<typeof ProfitBridge>;

// ---------------------------------------------------------------------------------------------
// breakEven (break_even.md)

export const BreakEvenInput = z.object({ period: Period });
export type BreakEvenInput = z.input<typeof BreakEvenInput>;

/**
 * Nullable, not optional: `null` means "not computed" (no fixed costs set, or fewer than 30
 * orders in the window), so the screen shows the AC-A6 prompt instead of a number.
 */
export const BreakEven = z.object({
  period: Period,
  /** `CostSettings.fixedMonthlyCents` is set. False → every number below is null. */
  fixedCostsSet: z.boolean(),
  fixedMonthlyCents: Cents.nullable(),
  orders: Count,
  cm3: Cents,
  /** cm3 ÷ orders; null when orders is 0. */
  cm3PerOrder: Cents.nullable(),
  /** ceil(fixedMonthlyCents ÷ cm3PerOrder), orders per month. */
  breakEvenOrders: Count.nullable(),
  /** orders × 30 ÷ window days: orders per month at the current run rate. */
  pace: z.number().nullable(),
  /** cm3 × 30 ÷ window days − fixedMonthlyCents. */
  operatingProfitPace: Cents.nullable(),
  /** ≥ 30 orders in the window. */
  hasEnoughOrders: z.boolean(),
});
export type BreakEven = z.infer<typeof BreakEven>;

// ---------------------------------------------------------------------------------------------
// operations (reprint_cost.md, film_waste_cost.md, stage_wait_hours.md, press_minutes_per_unit.md,
// late_rate.md)

/** One cut of reprint cost: `key` is a `REPRINT_REASONS` value, a station id or a vendor connection id. */
export const ReprintCostRow = z.object({
  key: z.string(),
  label: z.string(),
  reprints: Count,
  cost: Cents,
});
export type ReprintCostRow = z.infer<typeof ReprintCostRow>;

export const ReprintCost = z.object({
  total: Cents,
  reprints: Count,
  /** Distinct items that reached `pressed` in the period (the rate's denominator). */
  itemsPressed: Count,
  /** reprints ÷ itemsPressed × 100; null below 30 items pressed. */
  ratePct: z.number().nullable(),
  byReason: z.array(ReprintCostRow.extend({ key: z.enum(REPRINT_REASONS) })),
  /** Per station, never per person (training, not blame). */
  byStation: z.array(ReprintCostRow),
  byVendor: z.array(ReprintCostRow),
});
export type ReprintCost = z.infer<typeof ReprintCost>;

export const FilmWasteRow = z.object({
  /** Vendor connection id, or `in_house`. */
  key: z.string(),
  label: z.string(),
  sheets: Count,
  /** Σ sheet cost × (1 − utilization). */
  wasteCost: Cents,
  /** Length-weighted utilization × 100; null below 10 sheets. */
  filmUsePct: z.number().nullable(),
});
export type FilmWasteRow = z.infer<typeof FilmWasteRow>;

export const FilmWaste = z.object({
  sheets: Count,
  wasteCost: Cents,
  filmUsePct: z.number().nullable(),
  byVendor: z.array(FilmWasteRow),
});
export type FilmWaste = z.infer<typeof FilmWaste>;

/** Hours an item spends in one state before its next transition. */
export const StageWait = z.object({
  state: z.enum(ORDER_ITEM_STATES),
  /** Items that entered the state in the period. */
  entries: Count,
  /** One decimal; null below 30 entries. */
  medianHours: z.number().nullable(),
  p90Hours: z.number().nullable(),
  /** Entered in the period and not yet moved on (counted to now, not in the median). */
  stillWaiting: Count,
});
export type StageWait = z.infer<typeof StageWait>;

export const PressStationRow = z.object({
  stationId: Id,
  stationName: z.string(),
  /** Successful press scans whose gap to the previous one was 0.1–10 minutes. */
  timedUnits: Count,
  /** Two decimals; null below 100 timed units ("not enough scans yet"). */
  medianMinutes: z.number().nullable(),
  p75Minutes: z.number().nullable(),
  unitsPerActiveHour: z.number().nullable(),
  /** `CostSettings.laborMinutesPerItem`, the estimate the measured number replaces. */
  settingMinutes: z.number(),
  /** Median differs from the setting by > 25 % with ≥ 100 timed units: link to Settings → Costs. */
  suggestUpdateLaborSetting: z.boolean(),
});
export type PressStationRow = z.infer<typeof PressStationRow>;

/** Late-shipment driver cuts (late_rate.md). Associations, never causes ("were more often"). */
export const LATE_DRIVERS = [
  "channel",
  "personalized",
  "rush",
  "multiUnit",
  "blockedOver24h",
] as const;
export const LateDriver = z.enum(LATE_DRIVERS);
export type LateDriver = z.infer<typeof LateDriver>;

export const LateDriverRow = z.object({
  driver: LateDriver,
  /** The cut's value: a channel, or `yes` / `no` for the boolean drivers. */
  value: z.string(),
  label: z.string(),
  shippedOrders: Count,
  lateOrders: Count,
  /** lateOrders ÷ shippedOrders × 100; null below 30 shipped orders (counts only). */
  latePct: z.number().nullable(),
});
export type LateDriverRow = z.infer<typeof LateDriverRow>;

export const LateDrivers = z.object({
  shippedOrders: Count,
  lateOrders: Count,
  latePct: z.number().nullable(),
  rows: z.array(LateDriverRow),
});
export type LateDrivers = z.infer<typeof LateDrivers>;

export const OperationsInput = z.object({
  period: Period,
  channel: Channel.optional(),
});
export type OperationsInput = z.input<typeof OperationsInput>;

export const Operations = z.object({
  period: Period,
  /**
   * Whole-response flag for the first-run state (AC-B/C-screen1): false when the shop is below
   * every metric's minimum sample across the board. Each metric keeps its own per-widget null.
   */
  hasEnoughHistory: z.boolean(),
  reprintCost: ReprintCost,
  filmWaste: FilmWaste,
  waits: z.array(StageWait),
  /** The critical-path state with the largest median wait; null when no state has enough entries. */
  bottleneckStep: z.enum(ORDER_ITEM_STATES).nullable(),
  pressMinutesPerUnit: z.array(PressStationRow),
  lateDrivers: LateDrivers,
  computedAt: Timestamp,
});
export type Operations = z.infer<typeof Operations>;

// ---------------------------------------------------------------------------------------------
// inventoryHealth (blank_stock_health.md, size_mix_gap.md, stockout_exposure.md)

export const DeadStockRow = z.object({
  blankVariantId: Id,
  /** "G64000 Sand L". */
  label: z.string(),
  onHand: Count,
  /** onHand × variant cost. */
  value: Cents,
  lastConsumedAt: Timestamp.nullable(),
});
export type DeadStockRow = z.infer<typeof DeadStockRow>;

export const DeadStock = z.object({
  /** Variants with stock and no `consume` movement in the window. */
  variants: Count,
  value: Cents,
  /** value ÷ onHandValue × 100; null when onHandValue is 0. */
  pctOfStockValue: z.number().nullable(),
  /** Largest value first, at most 50. */
  rows: z.array(DeadStockRow).max(50),
});
export type DeadStock = z.infer<typeof DeadStock>;

export const SizeMixSizeRow = z.object({
  blankVariantId: Id,
  size: z.string(),
  unitsSold: Count,
  onHand: Count,
  salesSharePct: z.number(),
  stockSharePct: z.number(),
  /** stockShare − salesShare in points: + over-stocked, − under-stocked. Null when the group is below its minimum. */
  gapPts: z.number().nullable(),
  /** onHand ÷ daily sales in the window; null when nothing sold. */
  coverDays: z.number().nullable(),
});
export type SizeMixSizeRow = z.infer<typeof SizeMixSizeRow>;

/** One style × color. Kept (not omitted) below 30 units sold, with `hasEnoughUnits: false` (AC-C1). */
export const SizeMixGapGroup = z.object({
  styleCode: z.string(),
  color: z.string(),
  label: z.string(),
  unitsSold: Count,
  onHand: Count,
  hasEnoughUnits: z.boolean(),
  sizes: z.array(SizeMixSizeRow),
});
export type SizeMixGapGroup = z.infer<typeof SizeMixGapGroup>;

export const StockoutExposureRow = z.object({
  blankVariantId: Id,
  label: z.string(),
  /** Sold units waiting on this blank. */
  units: Count,
  revenueAtRisk: Cents,
  earliestShipBy: Timestamp.nullable(),
});
export type StockoutExposureRow = z.infer<typeof StockoutExposureRow>;

export const StockoutExposure = z.object({
  units: Count,
  blanks: Count,
  revenueAtRisk: Cents,
  earliestShipBy: Timestamp.nullable(),
  rows: z.array(StockoutExposureRow),
});
export type StockoutExposure = z.infer<typeof StockoutExposure>;

/** Trailing window for consumption, sales shares and dead stock. Stock itself is as of now. */
export const InventoryHealthInput = z.object({
  days: z.number().int().min(7).max(365).default(90),
});
export type InventoryHealthInput = z.input<typeof InventoryHealthInput>;

export const InventoryHealth = z.object({
  days: z.number().int(),
  asOf: Timestamp,
  /** False under 90 days of InvAI history ("too early"), see `Operations.hasEnoughHistory`. */
  hasEnoughHistory: z.boolean(),
  onHandUnits: Count,
  onHandValue: Cents,
  /** Blank cost consumed in the window. */
  consumedCost: Cents,
  /** consumedCost × 365 ÷ days ÷ onHandValue, one decimal; null when onHandValue is 0 or not enough history. */
  turns: z.number().nullable(),
  deadStock: DeadStock,
  sizeMixGaps: z.array(SizeMixGapGroup),
  stockoutExposure: StockoutExposure,
});
export type InventoryHealth = z.infer<typeof InventoryHealth>;

// ---------------------------------------------------------------------------------------------
// supplierTrends (supplier_trends.md)

export const SupplierTrendRow = z.object({
  supplier: z.enum(SUPPLIERS),
  supplierName: z.string(),
  styleCode: z.string(),
  /** YYYY-MM of PO submission, shop time zone. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  purchaseOrders: Count,
  units: Count,
  /** Σ qty × unit cost ÷ Σ qty, in cents (may carry one decimal). */
  avgUnitCost: z.number().nonnegative(),
  /** Median days from submitted to fully received; null below 3 received POs in the month. */
  medianLeadDays: z.number().nullable(),
});
export type SupplierTrendRow = z.infer<typeof SupplierTrendRow>;

export const SupplierTrendsInput = z.object({ period: Period });
export type SupplierTrendsInput = z.input<typeof SupplierTrendsInput>;

export const SupplierTrends = z.object({
  period: Period,
  /** Supplier, style, month ascending. */
  rows: z.array(SupplierTrendRow),
  /** `InventorySettings.leadTimeDays`, what reorder points use today. */
  leadTimeSettingDays: z.number().int().nonnegative(),
  /** Median lead days over all fully received POs in the period; null below 3. */
  measuredLeadDays: z.number().nullable(),
  /** |measured − setting| > 3 days: link to the inventory settings (AC-C5). */
  suggestUpdateLeadTime: z.boolean(),
});
export type SupplierTrends = z.infer<typeof SupplierTrends>;

// ---------------------------------------------------------------------------------------------
// designLifecycle (design_lifecycle_stage.md)

/** First match wins: dead → new → growing → declining → steady → inactive. */
export const DESIGN_LIFECYCLE_STAGES = [
  "new",
  "growing",
  "steady",
  "declining",
  "dead",
  "inactive",
] as const;
export const DesignLifecycleStage = z.enum(DESIGN_LIFECYCLE_STAGES);
export type DesignLifecycleStage = z.infer<typeof DesignLifecycleStage>;

export const DesignLifecycleRow = z.object({
  designId: Id,
  designName: z.string(),
  stage: DesignLifecycleStage,
  /** Non-reprint, non-cancelled units in the last 28 days (u4) and the 28 before (p4). */
  units4w: Count,
  unitsPrior4w: Count,
  units365d: Count,
  firstSaleAt: Timestamp.nullable(),
  lastSaleAt: Timestamp.nullable(),
  hasActiveListing: z.boolean(),
  /** The market module's trend for this design when it has one: shown and wins over `stage` (AC-C4). */
  marketTrend: TrendClass.nullable(),
  /** Ratio (0.15 = +15 % over 4 weeks), from the same market reading. */
  marketGrowth4w: z.number().nullable(),
});
export type DesignLifecycleRow = z.infer<typeof DesignLifecycleRow>;

export const DesignLifecycleInput = z.object({
  /** Default: today in the shop's time zone. */
  asOf: DateOnly.optional(),
  channel: Channel.optional(),
});
export type DesignLifecycleInput = z.input<typeof DesignLifecycleInput>;

export const DesignLifecycle = z.object({
  /** The date actually used. */
  asOf: DateOnly,
  hasEnoughHistory: z.boolean(),
  rows: z.array(DesignLifecycleRow),
  stageCounts: z.array(z.object({ stage: DesignLifecycleStage, designs: Count, units4w: Count })),
});
export type DesignLifecycle = z.infer<typeof DesignLifecycle>;

// ---------------------------------------------------------------------------------------------
// export

/** Every analytics view has "Export CSV" with the same filters (the profit export pattern). */
export const ANALYTICS_VIEWS = [
  "unitEconomics",
  "losingOrders",
  "leakage",
  "shippingMargin",
  "profitBridge",
  "breakEven",
  "operations",
  "inventoryHealth",
  "supplierTrends",
  "designLifecycle",
] as const;
export const AnalyticsView = z.enum(ANALYTICS_VIEWS);
export type AnalyticsView = z.infer<typeof AnalyticsView>;

/**
 * One member per view, each carrying exactly that view's read input, so the export always
 * matches what is on screen; a filter the view doesn't take is dropped, never applied by mistake.
 */
export const AnalyticsExportInput = z.discriminatedUnion("view", [
  UnitEconomicsInput.extend({ view: z.literal("unitEconomics") }),
  LosingOrdersInput.extend({ view: z.literal("losingOrders") }),
  LeakageInput.extend({ view: z.literal("leakage") }),
  ShippingMarginInput.extend({ view: z.literal("shippingMargin") }),
  ProfitBridgeInput.extend({ view: z.literal("profitBridge") }),
  BreakEvenInput.extend({ view: z.literal("breakEven") }),
  OperationsInput.extend({ view: z.literal("operations") }),
  InventoryHealthInput.extend({ view: z.literal("inventoryHealth") }),
  SupplierTrendsInput.extend({ view: z.literal("supplierTrends") }),
  DesignLifecycleInput.extend({ view: z.literal("designLifecycle") }),
]);
export type AnalyticsExportInput = z.input<typeof AnalyticsExportInput>;

/** Same as `finance.exportCsv`: the S3 key of the file, fetched through `files.downloadUrl`. */
export const AnalyticsExport = z.object({ key: z.string() });
export type AnalyticsExport = z.infer<typeof AnalyticsExport>;
