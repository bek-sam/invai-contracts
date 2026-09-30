import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { hasPermission, ROLES } from "./roles";
import { ShippingMargin } from "./schemas/analytics";
import {
  DIGEST_ACTION_KINDS,
  DIGEST_DETECTORS,
  DigestAction,
  DigestActionParams,
} from "./schemas/digest";
import {
  TodayAction,
  TodayActionClick,
  TodayActionClickInput,
  TodayActions,
  TodayActionsInput,
} from "./schemas/today";

const at = "2026-09-30T14:00:00.000Z";
const supplierId = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";

const action = (rank: number, over: Record<string, unknown> = {}) => ({
  key: `D9:etsy:${rank}`,
  rank,
  detector: "D9",
  kind: "review_shipping_prices",
  params: { channel: "etsy", deltaCents: -62 },
  href: "/analytics/shipping?channel=etsy",
  impactCents: 4_250,
  clickedAt: null,
  ...over,
});

const set = (actions: unknown[], over: Record<string, unknown> = {}) => ({
  date: "2026-09-30",
  windowStart: "2026-09-23",
  windowEnd: "2026-09-29",
  actions,
  steady: false,
  generatedAt: at,
  ...over,
});

describe("digest enums (0.10.0, Track E)", () => {
  it("appends D9..D13 after market, keeping the old order", () => {
    expect(DIGEST_DETECTORS.slice(0, 9)).toEqual([
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "D8",
      "market",
    ]);
    expect(DIGEST_DETECTORS.slice(-5)).toEqual(["D9", "D10", "D11", "D12", "D13"]);
  });

  it("appends six action kinds at the end, D11 split into dead stock and size gap", () => {
    expect(DIGEST_ACTION_KINDS.indexOf("none")).toBe(10);
    expect(DIGEST_ACTION_KINDS.slice(-6)).toEqual([
      "review_shipping_prices",
      "review_losing_orders",
      "review_dead_stock",
      "restock_size_gap",
      "review_blank_cost",
      "see_break_even",
    ]);
  });

  it("params take style, color, size, supplier, signed points and signed integer deltaCents", () => {
    const p = {
      style: "Bella+Canvas 3001",
      color: "Heather Navy",
      size: "XL",
      supplierId,
      supplierName: "S&S Activewear",
      points: -18.5,
      deltaCents: -62,
    };
    expect(DigestActionParams.parse(p)).toEqual(p);
    expect(DigestActionParams.safeParse({ deltaCents: 1.5 }).success).toBe(false);
    expect(DigestActionParams.safeParse({ supplierId: "not-a-uuid" }).success).toBe(false);
    // Old params still parse alone (additive).
    expect(DigestActionParams.parse({ n: 3 })).toEqual({ n: 3 });
  });

  it("an old digest action with a new kind round-trips", () => {
    const a = { kind: "restock_size_gap", params: { size: "XL", points: -16 }, href: "/inventory" };
    expect(DigestAction.parse(a)).toEqual(a);
  });
});

describe("today.actions and today.recordActionClick", () => {
  it("both are finance.read, auth user, routed under /today/actions", () => {
    expect(PROCEDURE_PERMISSIONS["today.actions"]).toBe("finance.read");
    expect(PROCEDURE_PERMISSIONS["today.recordActionClick"]).toBe("finance.read");
    const procs = listProcedures(contract).filter((p) =>
      ["today.actions", "today.recordActionClick"].includes(p.path),
    );
    expect(procs.map((p) => [p.path, p.method, p.httpPath]).sort()).toEqual([
      ["today.actions", "GET", "/today/actions"],
      ["today.recordActionClick", "POST", "/today/actions/clicks"],
    ]);
    for (const p of procs) expect(p.meta.auth ?? "user", p.path).toBe("user");
    // today.summary keeps its floor auth and today.read.
    expect(PROCEDURE_PERMISSIONS["today.summary"]).toBe("today.read");
  });

  it("finance.read is owner, admin and office only (AC-E5)", () => {
    const holders = ROLES.filter((r) => hasPermission(r, "finance.read")).sort();
    expect(holders).toEqual(["admin", "office", "owner"]);
  });

  it("recordActionClick declares ACTION_NOT_FOUND (404)", () => {
    const errors = contract.today.recordActionClick["~orpc"].errorMap as Record<
      string,
      { status?: number }
    >;
    expect(errors.ACTION_NOT_FOUND?.status).toBe(404);
  });

  it("round-trips a built set with five ranked actions", () => {
    const s = set([
      action(1),
      action(2, {
        detector: "D11",
        kind: "review_dead_stock",
        params: { style: "Gildan 64000", color: "Black" },
        impactCents: null,
      }),
      action(3, {
        detector: "D11",
        kind: "restock_size_gap",
        params: { size: "2XL", points: -17 },
      }),
      action(4, {
        detector: "D12",
        kind: "review_blank_cost",
        params: { supplierId, points: 6.5 },
      }),
      action(5, { detector: "D13", kind: "see_break_even", params: {}, clickedAt: at }),
    ]);
    expect(TodayActions.parse(s)).toEqual(s);
  });

  it("caps actions at 5 and rank at 1..5", () => {
    const six = [1, 2, 3, 4, 5, 5].map((r) => action(r));
    expect(TodayActions.safeParse(set(six)).success).toBe(false);
    expect(TodayAction.safeParse(action(0)).success).toBe(false);
    expect(TodayAction.safeParse(action(6)).success).toBe(false);
  });

  it("impactCents is integer cents or null", () => {
    expect(TodayAction.safeParse(action(1, { impactCents: 12.5 })).success).toBe(false);
    expect(TodayAction.safeParse(action(1, { impactCents: -300 })).success).toBe(true);
    expect(TodayAction.safeParse(action(1, { impactCents: null })).success).toBe(true);
  });

  it("key is required, non-empty and at most 128 chars", () => {
    const { key: _drop, ...noKey } = action(1);
    expect(TodayAction.safeParse(noKey).success).toBe(false);
    expect(TodayAction.safeParse(action(1, { key: "" })).success).toBe(false);
    expect(TodayAction.safeParse(action(1, { key: "k".repeat(129) })).success).toBe(false);
    expect(TodayActionClickInput.safeParse({ date: "2026-09-30" }).success).toBe(false);
  });

  it("href is an in-app path, same rule as the digest", () => {
    expect(TodayAction.safeParse(action(1, { href: "https://evil.test/" })).success).toBe(false);
    expect(TodayAction.safeParse(action(1, { href: "//evil.test" })).success).toBe(false);
  });

  it("generatedAt null means not built yet; steady with no actions is the healthy state", () => {
    expect(TodayActions.parse(set([], { generatedAt: null })).generatedAt).toBeNull();
    expect(TodayActions.parse(set([], { steady: true })).steady).toBe(true);
  });

  it("inputs: date optional on the read, required on the click; click output round-trips", () => {
    expect(TodayActionsInput.parse({})).toEqual({});
    expect(TodayActionsInput.safeParse({ date: "30/09/2026" }).success).toBe(false);
    const c = { date: "2026-09-30", key: "D9:etsy:1", clickedAt: at };
    expect(TodayActionClick.parse(c)).toEqual(c);
    expect(TodayActionClickInput.parse({ date: c.date, key: c.key })).toEqual({
      date: c.date,
      key: c.key,
    });
  });
});

describe("shipmentsWithoutZone (text fix only)", () => {
  it("keeps its name and shape", () => {
    expect(Object.keys(ShippingMargin.shape)).toContain("shipmentsWithoutZone");
  });
});

describe("version", () => {
  it("is 0.10.0 (additive, minor bump on 0.x) and the floor baseline is untouched (ADR 0012)", () => {
    // The newest wave's test pins the exact version, so a bump touches one file.
    expect(CONTRACT_VERSION).toBe("0.10.0");
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
