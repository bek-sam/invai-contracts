import { isContractProcedure } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { hasPermission, type Permission, ROLES } from "./roles";
import { AssistantEvent, AssistantMessage } from "./schemas/ai";
import {
  DesignNichesSetInput,
  MARKET_RULES,
  MarketRecommendation,
  MarketTrend,
  PricePosition,
  PriceSimulation,
  SIGNAL_SOURCES,
  SignalProvenance,
} from "./schemas/market";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const id2 = "6a2d7d3b-1e6c-4b2f-8c9f-4b3a2d5e6f70";
const at = "2026-09-27T03:00:00.000Z";

const provenance = (source: (typeof SIGNAL_SOURCES)[number], mock: boolean) => ({
  source,
  licence: source === "own" ? "first_party" : "official_api",
  asOf: at,
  fetchedAt: at,
  mock,
});

const subject = { designId: id, designName: "Spooky Season Tee", niche: "halloween" };
const signalBase = {
  subject,
  confidence: 0.55,
  band: "medium",
  stale: false,
  mock: true,
  sources: [provenance("own", false), provenance("google_trends", true)],
  asOf: at,
};

describe("market permission matrix (spec AC24, card AC2)", () => {
  const MARKET_PROCEDURES = [
    "market.niches.taxonomy",
    "market.niches.get",
    "market.niches.set",
    "market.recommendations.list",
    "market.recommendations.vote",
  ] as const;

  it("every market procedure has the agreed permission", () => {
    expect(PROCEDURE_PERMISSIONS["market.niches.taxonomy"]).toBe("catalog.read");
    expect(PROCEDURE_PERMISSIONS["market.niches.get"]).toBe("catalog.read");
    expect(PROCEDURE_PERMISSIONS["market.niches.set"]).toBe("market.niches.manage");
    expect(PROCEDURE_PERMISSIONS["market.recommendations.list"]).toBe("finance.read");
    expect(PROCEDURE_PERMISSIONS["market.recommendations.vote"]).toBe("finance.read");
  });

  it("the matrix from roles.ts is exactly the agreed one", () => {
    // role -> procedures it may call
    const expected: Record<(typeof ROLES)[number], readonly string[]> = {
      owner: MARKET_PROCEDURES,
      admin: MARKET_PROCEDURES,
      office: MARKET_PROCEDURES,
      designer: ["market.niches.taxonomy", "market.niches.get", "market.niches.set"],
      presser: [],
      packer: [],
      receiver: [],
      vendor: [],
    };
    const matrix: Record<string, string[]> = {};
    for (const role of ROLES) {
      matrix[role] = MARKET_PROCEDURES.filter((p) =>
        hasPermission(role, PROCEDURE_PERMISSIONS[p] as Permission),
      );
    }
    expect(matrix).toEqual(expected);
  });

  it("market procedures are web-only (user auth) and routed under /market", () => {
    const procs = listProcedures(contract).filter((p) => p.path.startsWith("market."));
    expect(procs.map((p) => p.path).sort()).toEqual([...MARKET_PROCEDURES].sort());
    for (const p of procs) {
      expect(p.meta.auth ?? "user", p.path).toBe("user");
      expect(p.httpPath, p.path).toMatch(/^\/market\//);
    }
  });

  it("recommendations.list is cursor-paginated with ids <= 20", () => {
    const node = contract.market.recommendations.list;
    expect(isContractProcedure(node)).toBe(true);
    const input = node["~orpc"].inputSchema as unknown as z.ZodObject;
    const output = node["~orpc"].outputSchema as unknown as z.ZodObject;
    expect(input.shape).toHaveProperty("cursor");
    expect(output.shape).toHaveProperty("nextCursor");
    expect(input.safeParse({ ids: [] }).success).toBe(false);
    expect(input.safeParse({ ids: Array.from({ length: 21 }, () => id) }).success).toBe(false);
    expect(input.safeParse({ ids: [id, id2], minBand: "medium" }).success).toBe(true);
  });
});

describe("market schemas (card AC4, AC5)", () => {
  it("SignalProvenance requires source, licence, dates and mock", () => {
    expect(SignalProvenance.safeParse(provenance("census", false)).success).toBe(true);
    const { mock: _m, ...withoutMock } = provenance("census", false);
    expect(SignalProvenance.safeParse(withoutMock).success).toBe(false);
    expect(
      SignalProvenance.safeParse({ ...provenance("own", false), asOf: "2026-09-27" }).success,
    ).toBe(false);
  });

  it("enums keep the agreed order (consumers mirror them)", () => {
    expect(SIGNAL_SOURCES).toEqual([
      "own",
      "census",
      "google_trends",
      "pinterest_trends",
      "amazon_pricing",
      "amazon_brand_analytics",
      "walmart_pricing",
      "jungle_scout",
    ]);
    expect(MARKET_RULES).toEqual(["R1", "R2", "R3", "R4", "R5"]);
  });

  it("MarketTrend round-trips with per-source readings and a disagreement flag", () => {
    const trend = MarketTrend.parse({
      ...signalBase,
      trend: "rising",
      growth4w: 0.22,
      yoy: null,
      windowWeeks: 26,
      disagreement: true,
      insufficientReason: null,
      readings: [
        {
          provenance: provenance("own", false),
          trend: "rising",
          growth4w: 0.22,
          yoy: null,
          n: 26,
          insufficientReason: null,
        },
        {
          provenance: provenance("google_trends", true),
          trend: "falling",
          growth4w: -0.18,
          yoy: -0.1,
          n: 26,
          insufficientReason: null,
        },
      ],
    });
    expect(trend.readings[1]?.provenance.mock).toBe(true);
    expect(MarketTrend.safeParse({ ...signalBase, trend: "up" }).success).toBe(false);
  });

  it("PricePosition: available with quartiles in cents, or unavailable with a reason and n", () => {
    const ok = PricePosition.parse({
      ...signalBase,
      available: true,
      channel: "amazon",
      currentPriceCents: 2499,
      n: 14,
      percentile: 0.21,
      priceBand: "low",
      q1Cents: 2599,
      medianCents: 2899,
      q3Cents: 3299,
      featuredPriceCents: null,
      density: "typical",
    });
    expect(ok.available && ok.priceBand).toBe("low");

    const no = PricePosition.parse({
      ...signalBase,
      mock: false,
      sources: [],
      available: false,
      channel: "etsy",
      currentPriceCents: 2499,
      n: 0,
      reason: "no_compliant_source",
    });
    expect(!no.available && no.reason).toBe("no_compliant_source");
    for (const reason of ["no_compliant_source", "not_connected", "too_few_comparables"]) {
      expect(PricePosition.safeParse({ ...no, reason }).success, reason).toBe(true);
    }
    expect(PricePosition.safeParse({ ...no, reason: "etsy" }).success).toBe(false);
    // Fractional cents are never money.
    expect(PricePosition.safeParse({ ...ok, medianCents: 28.99 }).success).toBe(false);
    // Confidence stays a 0..1 ratio.
    expect(PricePosition.safeParse({ ...ok, confidence: 55 }).success).toBe(false);
  });

  it("PriceSimulation is own-data only and says what is missing", () => {
    const sim = PriceSimulation.parse({
      ...signalBase,
      mock: false,
      sources: [provenance("own", false)],
      channel: "etsy",
      currentPriceCents: 2499,
      costBasis: {
        unitCostCents: 850,
        shippingChargedCents: 0,
        adsPerUnitCents: null,
        refundRate: 0.02,
        feePct: 9.5,
        feeFixedCents: 20,
        periodDays: 90,
      },
      candidates: [
        {
          priceCents: 2499,
          origin: "current",
          netPerUnitCents: 1340,
          marginPct: 53.6,
          estimatedWeeklyUnits: null,
          estimatedWeeklyNetCents: null,
        },
      ],
      breakEvenCents: 1099,
      floorPriceCents: 1299,
      floorMarginPct: 15,
      priceResponse: null,
      incomplete: true,
      missing: ["ads"],
    });
    expect(sim.priceResponse).toBeNull();
    expect(
      PriceSimulation.safeParse({ ...sim, priceResponse: { elasticity: -5, pricePointsUsed: 2 } })
        .success,
    ).toBe(false);
  });

  it("MarketRecommendation carries rule, fixed action, params, vote and votedAt", () => {
    const rec = MarketRecommendation.parse({
      id,
      rule: "R1",
      action: "list_and_stock",
      target: { designId: id, designName: "Spooky Season Tee", niche: "halloween", channel: null },
      params: {
        designName: "Spooky Season Tee",
        channels: ["amazon"],
        blankName: "Bella 3001 Black M",
        blankBelowReorderPoint: true,
        peakMonth: 10,
        actByDate: "2026-09-08",
        expectedUnits: 120,
      },
      confidence: 0.72,
      band: "high",
      mock: true,
      sources: [provenance("own", false), provenance("census", false)],
      evidenceSignalIds: [id2],
      stale: false,
      shownIn: "assistant",
      shownAt: at,
      vote: null,
      votedAt: null,
      adoptedAt: null,
      outcome: null,
      createdAt: at,
    });
    expect(rec.vote).toBeNull();
    expect(MarketRecommendation.safeParse({ ...rec, vote: "done", votedAt: at }).success).toBe(
      true,
    );
    expect(MarketRecommendation.safeParse({ ...rec, vote: "maybe" }).success).toBe(false);
    expect(MarketRecommendation.safeParse({ ...rec, rule: "R6" }).success).toBe(false);
    // R4 ideas are capped at 2 and params never carry free text beyond them.
    expect(
      MarketRecommendation.safeParse({ ...rec, params: { ideas: ["a", "b", "c"] } }).success,
    ).toBe(false);
  });

  it("niches.set takes at most 2 distinct non-empty keys; an empty array clears (AC5)", () => {
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: [] }).success).toBe(true);
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: ["halloween"] }).success).toBe(
      true,
    );
    expect(
      DesignNichesSetInput.safeParse({ designId: id, niches: ["halloween", "4th-of-july"] })
        .success,
    ).toBe(true);
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: ["a", "b", "c"] }).success).toBe(
      false,
    );
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: [""] }).success).toBe(false);
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: ["  "] }).success).toBe(false);
    expect(DesignNichesSetInput.safeParse({ designId: id, niches: ["Dog Mom"] }).success).toBe(
      false,
    );
    expect(
      DesignNichesSetInput.safeParse({ designId: id, niches: ["halloween", "halloween"] }).success,
    ).toBe(false);
  });
});

describe("assistant event additions are additive (card AC1)", () => {
  it("wave 17 shapes still parse unchanged", () => {
    expect(
      AssistantEvent.safeParse({ type: "tool_result", name: "get_profit", summary: "ok" }).success,
    ).toBe(true);
    expect(
      AssistantEvent.safeParse({ type: "tool_call", name: "get_profit", input: {} }).success,
    ).toBe(true);
    expect(
      AssistantMessage.safeParse({ id, role: "assistant", text: "hi", createdAt: at }).success,
    ).toBe(true);
  });

  it("the four market tool names are at the end of the tool_call enum", () => {
    const toolCall = AssistantEvent.options.find(
      (o) => o.shape.type.value === "tool_call",
    ) as z.ZodObject<{ name: z.ZodEnum<Record<string, string>> }>;
    const names = toolCall.shape.name.options;
    expect(names.slice(-4)).toEqual([
      "get_market_trend",
      "get_seasonality",
      "get_price_position",
      "simulate_price",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("tool_result carries mock, sources and at most 3 recommendation refs; no new union member", () => {
    const rec = { id, rule: "R2", band: "medium", mock: true };
    const ev = AssistantEvent.parse({
      type: "tool_result",
      name: "get_price_position",
      summary: "Priced low on Amazon (sample data)",
      mock: true,
      sources: [{ source: "amazon_pricing", asOf: at, mock: true }],
      recommendations: [rec],
    });
    expect(ev.type === "tool_result" && ev.recommendations?.[0]?.rule).toBe("R2");
    expect(
      AssistantEvent.safeParse({
        type: "tool_result",
        name: "x",
        summary: "",
        recommendations: [rec, rec, rec, rec],
      }).success,
    ).toBe(false);
    expect(AssistantEvent.options.map((o) => o.shape.type.value).sort()).toEqual(
      ["done", "error", "start", "text_delta", "tool_call", "tool_result"].sort(),
    );
    expect(
      AssistantMessage.safeParse({
        id,
        role: "assistant",
        text: "hi",
        createdAt: at,
        recommendations: [rec],
        mock: true,
      }).success,
    ).toBe(true);
  });
});

describe("version", () => {
  it("is 0.6.1 and the floor baseline is untouched (nothing here is floor-facing, ADR 0012)", () => {
    expect(CONTRACT_VERSION).toBe("0.6.1");
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
