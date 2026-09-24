import { describe, expect, it } from "vitest";
import {
  canTransition,
  deriveOrderStatus,
  ITEM_TRANSITIONS,
  ORDER_ITEM_STATES,
  type OrderItemState,
  PRE_SHIPPED_STATES,
  SHEET_STATES,
  SHEET_TRANSITIONS,
} from "./states";

describe("ITEM_TRANSITIONS", () => {
  it("covers every state and only known states", () => {
    for (const state of ORDER_ITEM_STATES) {
      expect(ITEM_TRANSITIONS[state]).toBeDefined();
      for (const to of ITEM_TRANSITIONS[state]) expect(ORDER_ITEM_STATES).toContain(to);
    }
  });

  it("matches architecture.md 3.1", () => {
    const doc: [OrderItemState, OrderItemState][] = [
      ["imported", "needs_mapping"],
      ["needs_mapping", "ready"],
      ["imported", "ready"],
      ["ready", "needs_artwork"],
      ["needs_artwork", "ready"],
      ["ready", "on_sheet"],
      ["on_sheet", "transfer_in"],
      ["transfer_in", "pressed"],
      ["pressed", "packed"],
      ["pressed", "ready"],
      ["packed", "shipped"],
      ["shipped", "delivered"],
    ];
    for (const [from, to] of doc) expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
  });

  it("allows on_hold and cancelled from every pre-shipped state, and nowhere after", () => {
    for (const from of PRE_SHIPPED_STATES) {
      expect(canTransition(from, "on_hold")).toBe(true);
      expect(canTransition(from, "cancelled")).toBe(true);
    }
    expect(canTransition("shipped", "on_hold")).toBe(false);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });

  it("releases a hold back to any pre-shipped state but never to shipped", () => {
    for (const to of PRE_SHIPPED_STATES) expect(canTransition("on_hold", to)).toBe(true);
    expect(canTransition("on_hold", "shipped")).toBe(false);
    expect(canTransition("on_hold", "delivered")).toBe(false);
  });

  it("rejects skips and terminal moves", () => {
    expect(canTransition("ready", "pressed")).toBe(false);
    expect(canTransition("imported", "on_sheet")).toBe(false);
    expect(canTransition("packed", "delivered")).toBe(false);
    expect(canTransition("cancelled", "ready")).toBe(false);
    expect(canTransition("delivered", "shipped")).toBe(false);
    expect(ITEM_TRANSITIONS.cancelled).toHaveLength(0);
    expect(ITEM_TRANSITIONS.delivered).toHaveLength(0);
  });
});

describe("deriveOrderStatus", () => {
  it("follows the precedence rules", () => {
    expect(deriveOrderStatus([])).toBe("new");
    expect(deriveOrderStatus(["imported", "ready"])).toBe("new");
    expect(deriveOrderStatus(["ready", "needs_mapping"])).toBe("needs_attention");
    expect(deriveOrderStatus(["on_sheet", "ready"])).toBe("in_production");
    expect(deriveOrderStatus(["packed", "packed"])).toBe("ready_to_ship");
    expect(deriveOrderStatus(["packed", "shipped"])).toBe("partially_shipped");
    expect(deriveOrderStatus(["shipped", "delivered"])).toBe("shipped");
    expect(deriveOrderStatus(["delivered", "delivered"])).toBe("delivered");
    expect(deriveOrderStatus(["pressed", "on_hold"])).toBe("on_hold");
    expect(deriveOrderStatus(["cancelled", "cancelled"])).toBe("cancelled");
  });

  it("ignores cancelled units unless every unit is cancelled", () => {
    expect(deriveOrderStatus(["cancelled", "shipped"])).toBe("shipped");
    expect(deriveOrderStatus(["cancelled", "needs_artwork"])).toBe("needs_attention");
  });
});

describe("SHEET_TRANSITIONS", () => {
  it("covers every sheet state", () => {
    for (const s of SHEET_STATES) expect(SHEET_TRANSITIONS[s]).toBeDefined();
    expect(SHEET_TRANSITIONS.sent).toContain("acknowledged");
    expect(SHEET_TRANSITIONS.printed).toContain("shipped");
    expect(SHEET_TRANSITIONS.received).toHaveLength(0);
  });
});
