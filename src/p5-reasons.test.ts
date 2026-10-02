import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import {
  ALERT_KINDS,
  ALERT_MESSAGE_CODES,
  ALERT_MESSAGE_PARAM_KEYS,
  Alert,
  AlertParams,
} from "./schemas/alerts";
import {
  CANCEL_REASONS,
  HOLD_REASONS,
  TIMELINE_KINDS,
  TIMELINE_REASON_CODES,
  TimelineEntry,
  TimelineReasonParams,
} from "./schemas/orders";
import { REPRINT_REASONS } from "./schemas/production";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const at = "2026-10-01T14:00:00.000Z";

const oldAlert = {
  id,
  kind: "order_at_risk",
  severity: "warning",
  title: "Order 1042 at risk",
  message: "Ships within 5h and has no label yet.",
  entity: { type: "order", id },
  readAt: null,
  createdAt: at,
};

const oldEntry = {
  id,
  at,
  kind: "state_changed",
  orderItemId: id,
  actor: { userId: null, name: "InvAI", station: null },
  from: "ready",
  to: "on_sheet",
  message: "ready → on_sheet (on sheet S-12)",
  meta: {},
};

describe("additive only (lesson A2: no existing enum grows)", () => {
  it("keeps the existing enums exactly as they were", () => {
    expect(ALERT_KINDS).toHaveLength(18);
    expect(ALERT_KINDS.at(-1)).toBe("ai_summary_breaker");
    expect(TIMELINE_KINDS).toHaveLength(17);
    expect(TIMELINE_KINDS.at(-1)).toBe("address_updated");
    expect(HOLD_REASONS).toHaveLength(7);
    expect(CANCEL_REASONS).toHaveLength(7);
    expect(REPRINT_REASONS.at(-1)).toBe("cracking");
  });

  it("parses an old alert and an old timeline entry unchanged (old backend, new client)", () => {
    expect(Alert.parse(oldAlert)).toEqual(oldAlert);
    expect(TimelineEntry.parse(oldEntry)).toEqual(oldEntry);
  });
});

describe("Alert.messageCode + params (B-224)", () => {
  it("round-trips an alert with a code and params", () => {
    const a = {
      ...oldAlert,
      messageCode: "order_at_risk",
      params: { orderNo: "1042", shipBy: at, timeZone: "America/Phoenix", hours: 5 },
    };
    expect(Alert.parse(a)).toEqual(a);
  });

  it("rejects an unknown code and a non-ISO date", () => {
    expect(Alert.safeParse({ ...oldAlert, messageCode: "order_late" }).success).toBe(false);
    expect(AlertParams.safeParse({ shipBy: "Sep 26" }).success).toBe(false);
  });

  it("drops keys outside the params list (no free text rides along)", () => {
    expect(AlertParams.parse({ orderNo: "1", buyerName: "x" })).toEqual({ orderNo: "1" });
  });

  it("names the keys of every code, each a real AlertParams key", () => {
    expect(Object.keys(ALERT_MESSAGE_PARAM_KEYS).sort()).toEqual([...ALERT_MESSAGE_CODES].sort());
    const known = new Set(Object.keys(AlertParams.shape));
    for (const keys of Object.values(ALERT_MESSAGE_PARAM_KEYS))
      for (const k of keys) expect(known.has(k)).toBe(true);
  });

  it("covers the reused kinds with separate codes", () => {
    for (const c of [
      "label_buy_stuck",
      "label_void_stuck",
      "tracking_push_stuck",
      "vendor_email_unconfirmed",
      "vendor_email_failed",
      "po_stuck_submitting",
      "webhook_stuck",
      "plan_limit_near",
    ])
      expect(ALERT_MESSAGE_CODES).toContain(c);
  });
});

describe("TimelineEntry.reasonCode + reasonParams (B-238)", () => {
  it("round-trips a sheet reason and a reprint reason", () => {
    const sheet = { ...oldEntry, reasonCode: "on_sheet", reasonParams: { sheetName: "S-12" } };
    expect(TimelineEntry.parse(sheet)).toEqual(sheet);
    const reprint = {
      ...oldEntry,
      from: "pressed",
      to: "ready",
      message: "pressed → ready (reprint: misprint)",
      reasonCode: "reprint",
      reasonParams: { reprintReason: "misprint" },
    };
    expect(TimelineEntry.parse(reprint)).toEqual(reprint);
  });

  it("types hold, cancel and reprint reasons by their own enums", () => {
    expect(TimelineReasonParams.safeParse({ holdReason: "address_check" }).success).toBe(true);
    expect(TimelineReasonParams.safeParse({ cancelReason: "fraud" }).success).toBe(true);
    expect(TimelineReasonParams.safeParse({ holdReason: "fraud" }).success).toBe(false);
    expect(TimelineReasonParams.safeParse({ reprintReason: "smudge" }).success).toBe(false);
    expect(TimelineEntry.safeParse({ ...oldEntry, reasonCode: "on sheet" }).success).toBe(false);
  });

  it("has a code for every fixed reason a producer writes today", () => {
    for (const c of ["unknown_sku", "mapped", "scan_match", "qc_pass", "held", "cancelled"])
      expect(TIMELINE_REASON_CODES).toContain(c);
    expect(new Set(TIMELINE_REASON_CODES).size).toBe(TIMELINE_REASON_CODES.length);
  });
});

describe("version", () => {
  it("is at least 0.11.0 and the floor baseline is untouched (ADR 0012)", () => {
    // The newest wave's test (photos.test.ts) pins the exact version, so a bump touches one file.
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.11.0")).toBe(true);
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
