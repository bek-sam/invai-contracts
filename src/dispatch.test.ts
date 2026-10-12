import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { ALERT_MESSAGE_CODES, ALERT_MESSAGE_PARAM_KEYS, AlertMessageCode } from "./schemas/alerts";
import { TodaySummary } from "./schemas/today";

describe("dispatch alert codes and Today counts (0.16.0, B-143)", () => {
  it("appends the three codes last, in order, with the spec's param keys", () => {
    expect(ALERT_MESSAGE_CODES.slice(-3)).toEqual([
      "dispatch_pickup_missed",
      "dispatch_overdue",
      "dispatch_overdue_unconfirmed",
    ]);
    for (const c of ALERT_MESSAGE_CODES.slice(-3))
      expect(AlertMessageCode.safeParse(c).success).toBe(true);
    expect([...ALERT_MESSAGE_PARAM_KEYS.dispatch_pickup_missed]).toEqual([
      "orderNo",
      "shipBy",
      "timeZone",
      "hours",
      "channel",
    ]);
    expect([...ALERT_MESSAGE_PARAM_KEYS.dispatch_overdue]).toEqual([
      "orderNo",
      "shipBy",
      "timeZone",
      "channel",
    ]);
    expect([...ALERT_MESSAGE_PARAM_KEYS.dispatch_overdue_unconfirmed]).toEqual([
      "orderNo",
      "shipBy",
      "timeZone",
      "channel",
    ]);
  });

  const base = { dueToday: 0, overdue: 0, atRisk: 0, onHold: 0, newSinceYesterday: 0 };
  const Orders = TodaySummary.shape.orders;

  it("parses a summary without the new fields, and with them", () => {
    expect(Orders.safeParse(base).success).toBe(true);
    expect(
      Orders.safeParse({
        ...base,
        dispatchAtRisk: [{ channel: "etsy", count: 5 }],
        dispatchUnconfirmed: 2,
      }).success,
    ).toBe(true);
  });

  it("refuses a negative count, a fractional count and an unknown channel", () => {
    expect(Orders.safeParse({ ...base, dispatchUnconfirmed: -1 }).success).toBe(false);
    expect(
      Orders.safeParse({ ...base, dispatchAtRisk: [{ channel: "etsy", count: -1 }] }).success,
    ).toBe(false);
    expect(
      Orders.safeParse({ ...base, dispatchAtRisk: [{ channel: "etsy", count: 1.5 }] }).success,
    ).toBe(false);
    expect(
      Orders.safeParse({ ...base, dispatchAtRisk: [{ channel: "nope", count: 1 }] }).success,
    ).toBe(false);
  });

  it("is at least 0.16.0 and leaves the floor baseline alone", () => {
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.16.0")).toBe(true);
    expect(isContractVersionAtLeast(FLOOR_COMPAT_BASELINE, "0.16.0")).toBe(false);
  });
});
