import { isContractProcedure } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { Events } from "./events";
import { parseRealtimeEvent, RealtimeEvents } from "./realtime";
import { hasPermission, type Permission, ROLES } from "./roles";
import { CREDIT_KINDS } from "./schemas/ai";
import { ALERT_KINDS } from "./schemas/alerts";
import {
  DIGEST_STATUSES,
  Digest,
  DigestFact,
  DigestFeedbackInput,
  DigestInsight,
  DigestRecipientEmailInput,
  DigestSettings,
  DigestSettingsInput,
  DigestSummary,
  NARRATIVE_STATUSES,
  WeekKey,
} from "./schemas/digest";
import { NOTIFICATION_KINDS, NotificationPreferences } from "./schemas/tenancy";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const id2 = "6a2d7d3b-1e6c-4b2f-8c9f-4b3a2d5e6f70";
const at = "2026-09-28T14:00:00.000Z";

const fact = (
  fid: string,
  unit: string,
  value: number | string | null,
  en: string,
  es: string,
) => ({
  id: fid,
  unit,
  value,
  formatted: { en, es },
});

const insight = {
  id: id2,
  detector: "D6",
  rank: 1,
  score: 42.5,
  confidence: 0.8,
  impactCents: 12000,
  action: { kind: "ship_overdue", params: { n: 4 }, href: "/orders?filter=overdue" },
  facts: [fact("d6.overdueCount", "count", 4, "4 overdue orders", "4 pedidos atrasados")],
  templateKey: "D6 action",
  recommendation: null,
  myVote: null,
  clicked: false,
};

const summary = {
  id,
  weekKey: "2026-W39",
  weekStart: "2026-09-21",
  weekEnd: "2026-09-27",
  status: "ready",
  narrativeStatus: "shadow",
  net: fact("net.thisWeek", "cents", 184250, "$1,842.50", "1.842,50 US$"),
  netChange: fact("net.change", "pct", 15.2, "+15.2%", "+15,2 %"),
  actionCount: 1,
  viewedAt: null,
  readyAt: at,
  createdAt: at,
};

const READ = [
  "digest.list",
  "digest.get",
  "digest.latest",
  "digest.feedback",
  "digest.recordClick",
];
const MANAGE = [
  "digest.settings.get",
  "digest.settings.set",
  "digest.settings.setRecipientEmail",
  "digest.sendPreview",
];
const NOTIFY = ["me.notifications.get", "me.notifications.set"];
const ALL = [...READ, ...MANAGE, ...NOTIFY];

describe("digest permission matrix (card AC2, spec AC27)", () => {
  it("read procedures are finance.read, settings and preview org.manage, notifications org.read", () => {
    for (const p of READ) expect(PROCEDURE_PERMISSIONS[p], p).toBe("finance.read");
    for (const p of MANAGE) expect(PROCEDURE_PERMISSIONS[p], p).toBe("org.manage");
    for (const p of NOTIFY) expect(PROCEDURE_PERMISSIONS[p], p).toBe("org.read");
  });

  it("the matrix from roles.ts is exactly the agreed one", () => {
    const expected: Record<(typeof ROLES)[number], readonly string[]> = {
      owner: ALL,
      admin: ALL,
      office: [...READ, ...NOTIFY],
      designer: NOTIFY,
      presser: NOTIFY,
      packer: NOTIFY,
      receiver: NOTIFY,
      vendor: NOTIFY,
    };
    const matrix: Record<string, string[]> = {};
    for (const role of ROLES) {
      matrix[role] = ALL.filter((p) => hasPermission(role, PROCEDURE_PERMISSIONS[p] as Permission));
    }
    expect(matrix).toEqual(expected);
    // Plan usage is a finer cut inside digest.get: owner and admin only, never office.
    expect(hasPermission("admin", "billing.read")).toBe(true);
    expect(hasPermission("office", "billing.read")).toBe(false);
  });

  it("every digest procedure is user auth and routed under /digest; notifications under /me", () => {
    const procs = listProcedures(contract).filter((p) => p.path.startsWith("digest."));
    expect(procs.map((p) => p.path).sort()).toEqual([...READ, ...MANAGE].sort());
    for (const p of procs) {
      expect(p.meta.auth ?? "user", p.path).toBe("user");
      expect(p.httpPath, p.path).toMatch(/^\/digest\//);
    }
    const notify = listProcedures(contract).filter((p) => p.path.startsWith("me.notifications."));
    expect(notify.map((p) => p.httpPath).sort()).toEqual([
      "/me/notifications/",
      "/me/notifications/",
    ]);
    expect(notify.map((p) => p.method).sort()).toEqual(["GET", "PUT"]);
  });

  it("digest.list is cursor-paginated and digest.get keys by week key as a query param", () => {
    const list = contract.digest.list;
    expect(isContractProcedure(list)).toBe(true);
    const input = list["~orpc"].inputSchema as unknown as z.ZodObject;
    const output = list["~orpc"].outputSchema as unknown as z.ZodObject;
    expect(input.shape).toHaveProperty("cursor");
    expect(output.shape).toHaveProperty("nextCursor");
    expect(contract.digest.get["~orpc"].route.path).toBe("/digest/week");
    expect(contract.digest.get["~orpc"].route.method).toBe("GET");
  });
});

describe("digest schemas (card AC3)", () => {
  it("WeekKey is YYYY-Www", () => {
    for (const ok of ["2026-W01", "2026-W39", "2026-W53"]) {
      expect(WeekKey.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ["2026-W00", "2026-W54", "2026-39", "2026-w39", "26-W39", "2026-W9"]) {
      expect(WeekKey.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("client statuses are only ready | skipped_quiet; narrative statuses never carry text", () => {
    expect(DIGEST_STATUSES).toEqual(["ready", "skipped_quiet"]);
    expect(NARRATIVE_STATUSES).toEqual([
      "none",
      "shadow",
      "ok",
      "rejected",
      "skipped_budget",
      "skipped_off",
    ]);
    expect(DigestSummary.safeParse({ ...summary, status: "building" }).success).toBe(false);
    expect(DigestSummary.safeParse({ ...summary, status: "failed" }).success).toBe(false);
    // No summary / narrative text field in 0.7.0 (shadow mode, A5).
    expect(Object.keys(Digest.shape)).not.toContain("summary");
    expect(Object.keys(Digest.shape)).not.toContain("narrative");
  });

  it("every fact carries id, raw value and formatted en/es; money is integer cents", () => {
    const parsed = DigestInsight.parse(insight);
    expect(parsed.facts[0]).toMatchObject({ id: "d6.overdueCount", value: 4 });
    expect(parsed.facts[0]?.formatted.es).toBe("4 pedidos atrasados");
    expect(
      DigestInsight.safeParse({ ...insight, facts: [{ id: "x", unit: "count", value: 1 }] })
        .success,
    ).toBe(false);
    expect(DigestInsight.safeParse({ ...insight, impactCents: 120.5 }).success).toBe(false);
    expect(DigestInsight.safeParse({ ...insight, confidence: 80 }).success).toBe(false);
    // A cents fact (not just impactCents) must also be a whole number.
    expect(
      DigestFact.safeParse(fact("net.thisWeek", "cents", 184250, "$1,842.50", "1.842,50 US$"))
        .success,
    ).toBe(true);
    expect(
      DigestFact.safeParse(fact("net.thisWeek", "cents", 184250.5, "$1,842.50", "1.842,50 US$"))
        .success,
    ).toBe(false);
    // Non-cents units are unaffected by the integer rule.
    expect(DigestFact.safeParse(fact("d6.rate", "pct", 15.2, "+15.2%", "+15,2 %")).success).toBe(
      true,
    );
  });

  it("insight detector is a known detector, with a fixed action kind and an in-app href", () => {
    for (const d of ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "market"]) {
      expect(DigestInsight.safeParse({ ...insight, detector: d }).success, d).toBe(true);
    }
    // D9..D13 became valid in 0.10.0 (today-actions.test.ts); an unknown detector still fails.
    expect(DigestInsight.safeParse({ ...insight, detector: "D14" }).success).toBe(false);
    expect(
      DigestInsight.safeParse({ ...insight, action: { ...insight.action, kind: "ship_now" } })
        .success,
    ).toBe(false);
    for (const bad of ["https://evil.test/x", "//evil.test", "orders", "/a\\b", ""]) {
      expect(
        DigestInsight.safeParse({ ...insight, action: { ...insight.action, href: bad } }).success,
        bad,
      ).toBe(false);
    }
  });

  it("a market insight reuses MarketRecommendation from 0.6.x", () => {
    const rec = {
      id: id2,
      rule: "R1",
      action: "list_and_stock",
      target: { designId: id, designName: "Spooky Season Tee", niche: "halloween", channel: null },
      params: { designName: "Spooky Season Tee", channels: ["amazon"] },
      confidence: 0.72,
      band: "high",
      mock: true,
      sources: [{ source: "own", licence: "first_party", asOf: at, fetchedAt: at, mock: false }],
      evidenceSignalIds: [],
      stale: false,
      shownIn: "digest",
      shownAt: at,
      vote: null,
      votedAt: null,
      adoptedAt: null,
      outcome: null,
      createdAt: at,
    };
    const market = DigestInsight.parse({
      ...insight,
      detector: "market",
      action: { kind: "market", params: { designId: id }, href: `/designs/${id}` },
      recommendation: rec,
    });
    expect(market.recommendation?.rule).toBe("R1");
    expect(
      DigestInsight.safeParse({ ...insight, recommendation: { id, rule: "R1" } }).success,
    ).toBe(false);
  });

  it("Digest: at most 3 actions, 1 win, 2 market items; planUsage optional and never null", () => {
    const full = {
      ...summary,
      timezone: "America/Phoenix",
      steady: false,
      incompleteOrders: 3,
      partialChannels: ["etsy"],
      glance: [
        {
          metric: "net",
          current: summary.net,
          previous: fact("net.lastWeek", "cents", 160000, "$1,600.00", "1.600,00 US$"),
          changePct: 15.2,
          change: fact("net.change", "cents", 24250, "+$242.50", "+242,50 US$"),
        },
      ],
      actions: [insight],
      win: { ...insight, detector: "D8", action: { kind: "none", params: {}, href: "/digests" } },
      marketWatch: [],
    };
    expect(Digest.parse(full).planUsage).toBeUndefined();
    expect(
      Digest.parse({
        ...full,
        planUsage: { ordersUsed: 412, ordersLimit: 1000, aiCreditsRemaining: 88 },
      }).planUsage?.ordersLimit,
    ).toBe(1000);
    expect(Digest.safeParse({ ...full, planUsage: null }).success).toBe(false);
    expect(
      Digest.safeParse({ ...full, actions: [insight, insight, insight, insight] }).success,
    ).toBe(false);
    expect(Digest.safeParse({ ...full, marketWatch: [insight, insight, insight] }).success).toBe(
      false,
    );
    expect(Digest.safeParse({ ...full, partialChannels: ["mercado"] }).success).toBe(false);
  });

  it("feedback: up | down with a reason only on down; reasons are the three from the spec", () => {
    const base = { digestId: id, insightId: id2 };
    expect(DigestFeedbackInput.safeParse({ ...base, vote: "up" }).success).toBe(true);
    for (const reason of ["not_relevant", "wrong", "already_knew"]) {
      expect(DigestFeedbackInput.safeParse({ ...base, vote: "down", reason }).success).toBe(true);
    }
    expect(DigestFeedbackInput.safeParse({ ...base, vote: "down", reason: "meh" }).success).toBe(
      false,
    );
    expect(DigestFeedbackInput.safeParse({ ...base, vote: "up", reason: "wrong" }).success).toBe(
      false,
    );
    expect(DigestFeedbackInput.safeParse({ ...base, vote: "meh" }).success).toBe(false);
  });

  it("settings: day mon..sun, hour 6..10, aiSummary + read-only global mode, recipients", () => {
    const settings = DigestSettings.parse({
      enabled: true,
      day: "mon",
      hour: 7,
      aiSummary: false,
      aiSummaryMode: "shadow",
      timezone: "America/Phoenix",
      recipients: [{ userId: id, name: "Dana Owner", emailOn: true, deliverable: "ok" }],
      updatedAt: null,
    });
    expect(settings.recipients[0]?.deliverable).toBe("ok");
    for (const hour of [5, 11, 7.5]) {
      expect(DigestSettingsInput.safeParse({ hour }).success, String(hour)).toBe(false);
    }
    expect(DigestSettingsInput.safeParse({}).success).toBe(true);
    expect(DigestSettingsInput.safeParse({ day: "monday" }).success).toBe(false);
    expect(DigestSettingsInput.safeParse({ day: "sun", hour: 10, enabled: false }).success).toBe(
      true,
    );
    // An admin can only turn a recipient's email off.
    expect(DigestRecipientEmailInput.safeParse({ userId: id, on: false }).success).toBe(true);
    expect(DigestRecipientEmailInput.safeParse({ userId: id, on: true }).success).toBe(false);
  });

  it("me.notifications is keyed by kind; digest is the only kind in 0.7.0", () => {
    expect(NOTIFICATION_KINDS).toEqual(["digest"]);
    const prefs = NotificationPreferences.parse({
      items: [{ kind: "digest", on: false, source: null, updatedAt: null }],
    });
    expect(prefs.items[0]?.on).toBe(false);
    expect(
      NotificationPreferences.safeParse({
        items: [{ kind: "digest", on: true, source: "unsubscribe_link", updatedAt: at }],
      }).success,
    ).toBe(true);
    expect(
      NotificationPreferences.safeParse({ items: [{ kind: "sms", on: true, source: null }] })
        .success,
    ).toBe(false);
  });
});

describe("digest.ready event (card AC5) and appended enum values", () => {
  it("is in both the outbox and the realtime map with {digestId, weekKey}", () => {
    const payload = { digestId: id, weekKey: "2026-W39" };
    expect(Events["digest.ready"].parse(payload)).toEqual(payload);
    expect(parseRealtimeEvent("digest.ready", payload)).toEqual(payload);
    expect(parseRealtimeEvent("digest.ready", { digestId: id, weekKey: "39" })).toBeNull();
    // Later waves append after it (photos.test.ts pins the current end).
    expect(Object.keys(RealtimeEvents)).toContain("digest.ready");
  });

  it("digest_narrative and ai_summary_breaker are appended at the end (consumers mirror them)", () => {
    expect(CREDIT_KINDS.indexOf("digest_narrative")).toBeGreaterThan(
      CREDIT_KINDS.indexOf("market_niche"),
    );
    expect(ALERT_KINDS.at(-1)).toBe("ai_summary_breaker");
    expect(new Set(CREDIT_KINDS).size).toBe(CREDIT_KINDS.length);
    expect(new Set(ALERT_KINDS).size).toBe(ALERT_KINDS.length);
  });
});

describe("version", () => {
  it("is at least 0.7.0 (new namespace, minor bump) and the floor baseline is untouched (ADR 0012)", () => {
    // The newest wave's test pins the exact version (src/p2-sweep.test.ts), so a bump touches one file.
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.7.0")).toBe(true);
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
