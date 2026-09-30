import {
  AnalyticsExport,
  AnalyticsExportInput,
  BreakEven,
  BreakEvenInput,
  DesignLifecycle,
  DesignLifecycleInput,
  InventoryHealth,
  InventoryHealthInput,
  Leakage,
  LeakageInput,
  LosingOrders,
  LosingOrdersInput,
  Operations,
  OperationsInput,
  ProfitBridge,
  ProfitBridgeInput,
  ShippingMargin,
  ShippingMarginInput,
  SupplierTrends,
  SupplierTrendsInput,
  UnitEconomics,
  UnitEconomicsInput,
} from "../schemas/analytics";
import { base, proc } from "./_base";

/**
 * `analytics.*` (wave A1, T-A2; spec `specs/business-analytics-v2.md`): read-only views over the
 * shop's own orders, costs, scans, stock and purchase orders. Every procedure needs `finance.read`
 * (owner, admin, office; AC-E5) with the default `auth: user`, never floor or station: the
 * numbers are the shop's money, and a tablet has no screen for them. Handlers run inside
 * `withTenant` (AC-E4). Nothing here writes anything (spec §5 rule 5: suggest, never act).
 *
 * Range procedures are `GET` with the shared `Period` as query input, like `finance.profit`, so
 * AC-G1 parity (Profit page = unitEconomics = assistant = digest, to the cent) is one call each.
 * Business outcomes ("not enough data", "no fixed costs set") are values in the output, never
 * errors. The only domain error is a period that can't be answered.
 *
 * Implementers: T-A3 (unitEconomics, losingOrders, leakage, shippingMargin, profitBridge,
 * breakEven), T-A4 (operations), T-A5 (inventoryHealth, supplierTrends, designLifecycle, export).
 */

/** Guards the read services from an unbounded scan (AC-G2: under 1 s p95 at 1,000 orders/day). */
const PERIOD_ERRORS = {
  PERIOD_INVALID: {
    status: 400,
    message: "The period must end after it starts and cover at most 400 days",
  },
} as const;

export const analytics = base
  .prefix("/analytics")
  .tag("analytics")
  .router({
    /** CM1/CM2/CM3 ladder by dimension. Totals equal `finance.profit`'s Net for the same filters. */
    unitEconomics: proc("finance.read")
      .route({ method: "GET", path: "/unit-economics" })
      .input(UnitEconomicsInput)
      .output(UnitEconomics)
      .errors(PERIOD_ERRORS),
    /** Orders with CM2 < 0, worst first, with the cost line that sank each one. */
    losingOrders: proc("finance.read")
      .route({ method: "GET", path: "/losing-orders" })
      .input(LosingOrdersInput)
      .output(LosingOrders)
      .errors(PERIOD_ERRORS),
    /** Gross sales → contribution waterfall: discounts, fees, refunds, shipping loss, reprints. */
    leakage: proc("finance.read")
      .route({ method: "GET", path: "/leakage" })
      .input(LeakageInput)
      .output(Leakage)
      .errors(PERIOD_ERRORS),
    /** Shipping charged minus label cost for InvAI-labeled orders, by channel, service, weight or zone. */
    shippingMargin: proc("finance.read")
      .route({ method: "GET", path: "/shipping-margin" })
      .input(ShippingMarginInput)
      .output(ShippingMargin)
      .errors(PERIOD_ERRORS),
    /**
     * Why CM3 changed between `basePeriod` and `period`: volume part + rate part = total change,
     * top 10 movers. `basePeriod` defaults to the equal-length period ending where `period` starts.
     */
    profitBridge: proc("finance.read")
      .route({ method: "GET", path: "/profit-bridge" })
      .input(ProfitBridgeInput)
      .output(ProfitBridge)
      .errors(PERIOD_ERRORS),
    /** Orders per month needed to cover `CostSettings.fixedMonthlyCents`, and the current pace. */
    breakEven: proc("finance.read")
      .route({ method: "GET", path: "/break-even" })
      .input(BreakEvenInput)
      .output(BreakEven)
      .errors(PERIOD_ERRORS),
    /** Reprint cost, film waste, waits and bottleneck, measured press minutes, late-shipment drivers. */
    operations: proc("finance.read")
      .route({ method: "GET", path: "/operations" })
      .input(OperationsInput)
      .output(Operations)
      .errors(PERIOD_ERRORS),
    /** Stock snapshot: on-hand value, turns, dead stock, size-mix gaps, stockout exposure. */
    inventoryHealth: proc("finance.read")
      .route({ method: "GET", path: "/inventory-health" })
      .input(InventoryHealthInput)
      .output(InventoryHealth),
    /** Unit cost by supplier × style × month, measured lead days vs the lead-time setting. */
    supplierTrends: proc("finance.read")
      .route({ method: "GET", path: "/supplier-trends" })
      .input(SupplierTrendsInput)
      .output(SupplierTrends)
      .errors(PERIOD_ERRORS),
    /** Stage per design as of a date; the market module's trend wins when it has one. */
    designLifecycle: proc("finance.read")
      .route({ method: "GET", path: "/design-lifecycle" })
      .input(DesignLifecycleInput)
      .output(DesignLifecycle),
    /**
     * CSV of any view with that view's own filters, so the file matches the screen (AC-E6).
     * Returns the file's S3 key, exactly like `finance.exportCsv`. No buyer name, email, address
     * or personalization text is ever in the file.
     */
    export: proc("finance.read")
      .route({ method: "POST", path: "/export-csv" })
      .input(AnalyticsExportInput)
      .output(AnalyticsExport)
      .errors(PERIOD_ERRORS),
  });
