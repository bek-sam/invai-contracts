import { isContractProcedure } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { hasPermission, ROLES } from "./roles";
import { AssistantEvent } from "./schemas/ai";
import {
  ANALYTICS_VIEWS,
  AnalyticsExportInput,
  BreakEven,
  DesignLifecycle,
  InventoryHealth,
  Operations,
  UnitEconomics,
} from "./schemas/analytics";
import { CostSettings, CostSettingsInput } from "./schemas/finance";
import { Shipment } from "./schemas/shipping";

/*
 * T-A2 (wave A1): the `analytics` namespace, `CostSettings.fixedMonthlyCents`,
 * `Shipment.destZone` and the five v6 assistant tool names. Spec `specs/business-analytics-v2.md`.
 */

const ANALYTICS = listProcedures(contract.analytics, ["analytics"]);
const READS = ANALYTICS_VIEWS.map((v) => `analytics.${v}`);
const RANGE_READS = [
  "unitEconomics",
  "losingOrders",
  "leakage",
  "shippingMargin",
  "profitBridge",
  "breakEven",
  "operations",
  "supplierTrends",
] as const;

function procedure(path: string) {
  const node = path
    .split(".")
    .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], contract);
  if (!isContractProcedure(node)) throw new Error(`${path} is not a procedure`);
  return node["~orpc"];
}

function inputShape(path: string) {
  return (procedure(path).inputSchema as z.ZodObject).shape;
}

function outputShape(path: string) {
  return (procedure(path).outputSchema as z.ZodObject).shape;
}

const period = { from: "2026-09-21T00:00:00.000Z", to: "2026-09-28T00:00:00.000Z" };

describe("analytics namespace", () => {
  it("has the ten reads plus export, under /analytics, with unique routes", () => {
    expect(ANALYTICS.map((p) => p.path).sort()).toEqual([...READS, "analytics.export"].sort());
    for (const p of ANALYTICS) expect(p.httpPath, p.path).toMatch(/^\/analytics\//);
    expect(new Set(ANALYTICS.map((p) => `${p.method} ${p.httpPath}`)).size).toBe(ANALYTICS.length);
  });

  it("every procedure needs finance.read with user auth, never floor or station (AC-E5)", () => {
    for (const p of ANALYTICS) {
      expect(p.meta.permission, p.path).toBe("finance.read");
      expect(p.meta.auth ?? "user", p.path).toBe("user");
      expect(PROCEDURE_PERMISSIONS[p.path]).toBe("finance.read");
    }
  });

  it("owner, admin and office may call; designer, presser, packer, receiver and vendor may not", () => {
    const allowed = ROLES.filter((r) => hasPermission(r, "finance.read"));
    expect(allowed.sort()).toEqual(["admin", "office", "owner"]);
    for (const r of ["designer", "presser", "packer", "receiver", "vendor"] as const) {
      expect(hasPermission(r, "finance.read"), r).toBe(false);
    }
  });

  it("reads are GET, export is POST /analytics/export-csv with finance.exportCsv's output", () => {
    for (const path of READS) expect(procedure(path).route.method, path).toBe("GET");
    const exp = procedure("analytics.export");
    expect(exp.route.method).toBe("POST");
    expect(exp.route.path).toBe("/analytics/export-csv");
    expect(Object.keys(outputShape("analytics.export"))).toEqual(
      Object.keys(outputShape("finance.exportCsv")),
    );
  });

  it("range reads require the shared Period; snapshots take days or asOf (AC5)", () => {
    for (const name of RANGE_READS) {
      const shape = inputShape(`analytics.${name}`);
      expect(shape.period, name).toBe(inputShape("finance.profit").period);
      expect(shape.period?.safeParse(undefined).success, name).toBe(false);
    }
    const inv = inputShape("analytics.inventoryHealth");
    expect(inv.period).toBeUndefined();
    expect(inv.days?.parse(undefined)).toBe(90);
    expect(inv.days?.safeParse(3).success).toBe(false);
    expect(inv.days?.safeParse(400).success).toBe(false);
    const life = inputShape("analytics.designLifecycle");
    expect(life.period).toBeUndefined();
    expect(life.asOf?.safeParse(undefined).success).toBe(true);
    expect(life.asOf?.safeParse("2026-09-30").success).toBe(true);
    expect(life.asOf?.safeParse("2026-09-30T00:00:00Z").success).toBe(false);
  });

  it("channel is an optional CHANNELS enum wherever sales are the base (AC5)", () => {
    for (const name of [
      "unitEconomics",
      "losingOrders",
      "leakage",
      "shippingMargin",
      "profitBridge",
      "operations",
      "designLifecycle",
    ]) {
      const channel = inputShape(`analytics.${name}`).channel;
      expect(channel?.safeParse(undefined).success, name).toBe(true);
      expect(channel?.safeParse("etsy").success, name).toBe(true);
      expect(channel?.safeParse("ebay-uk").success, name).toBe(false);
    }
    // Stock, purchase orders and fixed costs have no channel: no filter the backend would ignore.
    for (const name of ["inventoryHealth", "supplierTrends", "breakEven"]) {
      expect(inputShape(`analytics.${name}`).channel, name).toBeUndefined();
    }
  });

  it("profitBridge defaults by to design and losingOrders caps limit at 50", () => {
    const bridge = procedure("analytics.profitBridge").inputSchema as z.ZodType;
    expect(bridge.parse({ period })).toMatchObject({ by: "design" });
    expect(bridge.safeParse({ period, basePeriod: period, by: "costLine" }).success).toBe(true);
    const losing = procedure("analytics.losingOrders").inputSchema as z.ZodType;
    expect(losing.parse({ period })).toMatchObject({ limit: 20 });
    expect(losing.safeParse({ period, limit: 51 }).success).toBe(false);
  });

  it("export takes exactly each view's own input, keyed by view", () => {
    expect(AnalyticsExportInput.options).toHaveLength(ANALYTICS_VIEWS.length);
    expect(AnalyticsExportInput.safeParse({ view: "unitEconomics", period }).success).toBe(false);
    expect(
      AnalyticsExportInput.parse({ view: "unitEconomics", period, dimension: "channel" }),
    ).toMatchObject({ limit: 200 });
    expect(AnalyticsExportInput.parse({ view: "inventoryHealth" })).toEqual({
      view: "inventoryHealth",
      days: 90,
    });
    // A filter the view doesn't take is dropped (z.object strips), never applied by mistake.
    expect(AnalyticsExportInput.parse({ view: "designLifecycle", days: 30 })).toEqual({
      view: "designLifecycle",
    });
    expect(AnalyticsExportInput.safeParse({ view: "goals", period }).success).toBe(false);
  });

  it("hasEnoughHistory is required on operations, inventoryHealth and designLifecycle", () => {
    for (const [name, schema] of [
      ["operations", Operations],
      ["inventoryHealth", InventoryHealth],
      ["designLifecycle", DesignLifecycle],
    ] as const) {
      const flag = (schema.shape as { hasEnoughHistory: z.ZodType }).hasEnoughHistory;
      expect(flag.safeParse(undefined).success, name).toBe(false);
      expect(flag.safeParse(false).success, name).toBe(true);
    }
  });

  it("round-trips a unit-economics report and marks the not-enough-data case as null", () => {
    const totals = {
      revenue: 100_000,
      cm1: 60_000,
      cm2: 40_000,
      cm3: 30_000,
      cm1Pct: 60,
      cm2Pct: 40,
      cm3Pct: 30,
      orders: 40,
      units: 55,
      estimatedShare: 0.2,
    };
    const report = UnitEconomics.parse({
      period,
      dimension: "channel",
      rows: [
        { ...totals, key: "etsy", label: "Etsy" },
        {
          ...totals,
          key: "tiktok",
          label: "TikTok Shop",
          units: 12,
          cm1Pct: null,
          cm2Pct: null,
          cm3Pct: null,
        },
      ],
      totals,
      ordersWithoutProfitLine: 105,
      computedAt: "2026-09-30T12:00:00.000Z",
    });
    expect(report.rows[1]?.cm3Pct).toBeNull();
    expect(report.ordersWithoutProfitLine).toBe(105);
    expect(UnitEconomics.safeParse({ ...report, ordersWithoutProfitLine: undefined }).success).toBe(
      false,
    );
    expect(UnitEconomics.safeParse({ ...report, totals: { ...totals, cm3: 1.5 } }).success).toBe(
      false,
    );
  });

  it("break-even with no fixed costs is a value, not an error (AC-A6)", () => {
    const empty = BreakEven.parse({
      period,
      fixedCostsSet: false,
      fixedMonthlyCents: null,
      orders: 255,
      cm3: 372_555,
      cm3PerOrder: 1461,
      breakEvenOrders: null,
      pace: null,
      operatingProfitPace: null,
      hasEnoughOrders: true,
    });
    expect(empty.breakEvenOrders).toBeNull();
    expect(BreakEven.safeParse({ ...empty, breakEvenOrders: undefined }).success).toBe(false);
  });
});

describe("CostSettings.fixedMonthlyCents", () => {
  const base = {
    feeTables: [],
    transferCentsPerSqIn: 3,
    packagingPerOrder: 45,
    laborRatePerHour: 1800,
    laborMinutesPerItem: 2,
    adsAllocation: "revenue_share",
    updatedAt: "2026-09-30T12:00:00.000Z",
  };

  it("is optional on output (handlers one version behind still parse) and non-negative", () => {
    expect(CostSettings.safeParse(base).success).toBe(true);
    expect(CostSettings.parse({ ...base, fixedMonthlyCents: null }).fixedMonthlyCents).toBeNull();
    expect(CostSettings.parse({ ...base, fixedMonthlyCents: 250_000 }).fixedMonthlyCents).toBe(
      250_000,
    );
    expect(CostSettings.safeParse({ ...base, fixedMonthlyCents: -1 }).success).toBe(false);
    expect(CostSettings.safeParse({ ...base, fixedMonthlyCents: 10.5 }).success).toBe(false);
  });

  it("is writable through finance.costSettings.update", () => {
    expect(CostSettingsInput.parse({ fixedMonthlyCents: 250_000 })).toEqual({
      fixedMonthlyCents: 250_000,
    });
    expect(CostSettingsInput.parse({ fixedMonthlyCents: null })).toEqual({
      fixedMonthlyCents: null,
    });
    expect(procedure("finance.costSettings.update").inputSchema).toBe(CostSettingsInput);
  });
});

describe("Shipment.destZone", () => {
  it("is an optional integer zone 1..9 and the only field added (AC-A4 starts at the contract)", () => {
    const zone = Shipment.shape.destZone;
    for (const ok of [1, 5, 9, null, undefined])
      expect(zone.safeParse(ok).success, `${ok}`).toBe(true);
    for (const bad of [0, 10, 2.5, "3"]) expect(zone.safeParse(bad).success, `${bad}`).toBe(false);
    const keys = Object.keys(Shipment.shape);
    expect(keys).toContain("destZone");
    // No new address-like field rode along: `shipTo` (already PII-guarded) stays the only one.
    const addressLike = keys.filter((k) => /zip|postal|address|street|city|name$/i.test(k));
    expect(addressLike).toEqual([]);
  });

  it("appears in no input schema", () => {
    for (const p of listProcedures(contract)) {
      const input = procedure(p.path).inputSchema as z.ZodObject | undefined;
      const shape = input && "shape" in input ? input.shape : undefined;
      expect(shape?.destZone, p.path).toBeUndefined();
    }
  });
});

describe("AssistantEvent tool_call names", () => {
  it("has the five v6 tools appended at the end and nothing else changed (AC4)", () => {
    const toolCall = AssistantEvent.options.find(
      (o) => o.shape.type.value === "tool_call",
    ) as z.ZodObject<{ name: z.ZodEnum<Record<string, string>> }>;
    expect(toolCall.shape.name.options).toEqual([
      "get_profit",
      "get_orders_summary",
      "get_stock",
      "get_listing_performance",
      "get_channel_performance",
      "get_production_status",
      "compare_periods",
      "get_ad_performance",
      "get_design_insights",
      "get_fulfillment_health",
      "get_market_trend",
      "get_seasonality",
      "get_price_position",
      "simulate_price",
      "get_unit_economics",
      "explain_profit_change",
      "get_operations_health",
      "get_inventory_health",
      "get_shipping_insights",
    ]);
  });
});

describe("version", () => {
  it("is at least 0.9.0 and the floor baseline is untouched (ADR 0012)", () => {
    // Only the newest wave's test pins the exact version (today-actions.test.ts).
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.9.0")).toBe(true);
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
