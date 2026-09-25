import { describe, expect, it } from "vitest";
import { CHANNEL_RULES, ChannelRules } from "./channels";
import { Events } from "./events";
import { parseRealtimeEvent, RealtimeEvents } from "./realtime";
import { ConnectInput, SkuRule } from "./schemas/channels";
import { NormalizedOrder, Order, OrderItem } from "./schemas/orders";
import { GangSheet, ScanInput, ScanResult } from "./schemas/production";
import { CHANNELS } from "./states";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const at = "2026-09-24T14:00:00.000Z";

describe("schema round-trips", () => {
  it("NormalizedOrder (adapter output) parses and keeps quantity", () => {
    const parsed = NormalizedOrder.parse({
      channel: "etsy",
      channelOrderId: "3456789012",
      orderNo: "3456789012",
      placedAt: at,
      shipBy: null,
      isRush: false,
      buyerName: "Ana Ruiz",
      buyerEmail: null,
      shipTo: {
        name: "Ana Ruiz",
        company: null,
        street1: "12 Cactus Rd",
        street2: null,
        city: "Phoenix",
        state: "AZ",
        zip: "85001",
        phone: null,
        email: null,
      },
      shippingMethod: "Standard",
      totals: { subtotal: 2499, shipping: 0, tax: 0, discount: 0, total: 2499 },
      buyerNote: null,
      sourceUpdatedAt: null,
      items: [
        {
          channelLineId: "1",
          channelSku: "BC3001-BLK-M-D1042",
          channelListingId: null,
          title: "Desert Bloom Tee",
          variantTitle: "Black / M",
          quantity: 2,
          unitPrice: 2499,
          personalization: [{ question: "Name", answer: "Ana", fileUrl: null }],
        },
      ],
    });
    expect(parsed.shipTo?.country).toBe("US");
    expect(parsed.items[0]?.quantity).toBe(2);
  });

  it("Order and OrderItem accept a fully populated record", () => {
    const item = OrderItem.parse({
      id,
      orderId: id,
      orderNo: "#1001",
      lineNo: 1,
      unitNo: 1,
      unitsInLine: 2,
      channelSku: "BC3001-BLK-M-D1042",
      channelListingId: null,
      title: "Desert Bloom Tee",
      variantTitle: null,
      unitPrice: 2499,
      personalization: [],
      state: "ready",
      heldFromState: null,
      design: { id, name: "Desert Bloom" },
      product: null,
      blank: { variantId: id, brand: "Bella+Canvas", style: "3001", color: "Black", size: "M" },
      placement: "front",
      artwork: { status: "none", fileKey: null, previewKey: null },
      flags: [],
      isRush: false,
      isReprint: false,
      transferId: null,
      sheetId: null,
      binCode: null,
      shipmentId: null,
      shipBy: at,
      updatedAt: at,
    });
    expect(item.state).toBe("ready");

    const order = Order.parse({
      id,
      channel: "shopify",
      connectionId: id,
      channelOrderId: "1001",
      orderNo: "#1001",
      status: "new",
      placedAt: at,
      shipBy: at,
      shippedAt: null,
      deliveredAt: null,
      isRush: false,
      atRisk: false,
      isOverdue: false,
      hasPersonalization: false,
      hold: null,
      cancel: null,
      packOverride: null,
      buyerName: "Ana",
      shipTo: null,
      shippingMethod: null,
      buyerNote: null,
      totals: { subtotal: 2499, shipping: 0, tax: 0, discount: 0, total: 2499 },
      itemCount: 1,
      binCode: null,
      tags: [],
      createdAt: at,
      updatedAt: at,
    });
    expect(order.status).toBe("new");
  });

  it("ScanInput defaults blankCode and ScanResult carries what the floor needs", () => {
    const scan = ScanInput.parse({
      clientScanId: id,
      station: "press",
      transferCode: `T:${id}`,
      scannedAt: at,
    });
    expect(scan.blankCode).toBeNull();
    const result = ScanResult.parse({
      ok: false,
      clientScanId: id,
      mismatch: "wrong_size",
      message: "Expected M, scanned L",
      transferId: id,
      orderItemId: id,
      orderId: id,
      orderNo: "#1001",
      design: { id, name: "Desert Bloom", code: "D1042" },
      expected: {
        blankVariantId: id,
        brand: "Bella+Canvas",
        style: "3001",
        color: "Black",
        size: "M",
      },
      scannedBlank: {
        blankVariantId: id,
        brand: "Bella+Canvas",
        style: "3001",
        color: "Black",
        size: "L",
      },
      placement: "front",
      isReprint: false,
      binCode: null,
      itemState: "transfer_in",
      nextAction: "pick_blank",
      orderOpenUnits: 2,
    });
    expect(result.mismatch).toBe("wrong_size");
    expect(() => ScanResult.parse({ ...result, mismatch: "bogus" })).toThrow();
  });

  it("GangSheet rejects utilization above 1 and unknown states", () => {
    const sheet = {
      id,
      batchId: id,
      sheetNo: 1,
      name: "2026-09-24 #1",
      vendorConnectionId: null,
      vendorName: null,
      widthIn: 22,
      lengthIn: 96.5,
      utilization: 0.83,
      status: "ready",
      transferCount: 40,
      reprintCount: 2,
      files: { pngKey: "sheets/x.png", pdfKey: null, previewKey: "sheets/x-preview.png" },
      cost: 2895,
      tracking: null,
      sentAt: null,
      acknowledgedAt: null,
      printedAt: null,
      shippedAt: null,
      receivedAt: null,
      error: null,
      createdAt: at,
      updatedAt: at,
    };
    expect(GangSheet.parse(sheet).utilization).toBe(0.83);
    expect(() => GangSheet.parse({ ...sheet, utilization: 1.2 })).toThrow();
    expect(() => GangSheet.parse({ ...sheet, status: "done" })).toThrow();
  });

  it("SkuRule template target applies defaults", () => {
    const rule = SkuRule.parse({
      id,
      name: null,
      patternType: "template",
      pattern: "{style}-{color}-{size}-{design}",
      channel: null,
      connectionId: null,
      target: { kind: "resolve" },
      priority: 0,
      active: true,
      source: "manual",
      matchCount: 0,
      lastMatchedAt: null,
      createdAt: at,
      updatedAt: at,
    });
    expect(rule.target).toEqual({ kind: "resolve", defaults: {} });
  });

  it("ConnectInput distinguishes Shopify OAuth from CSV channels", () => {
    expect(
      ConnectInput.parse({ channel: "shopify", shopDomain: "desert-bloom.myshopify.com" }).channel,
    ).toBe("shopify");
    expect(() => ConnectInput.parse({ channel: "shopify", shopDomain: "not a domain" })).toThrow();
    const csv = ConnectInput.parse({ channel: "etsy", name: "Desert Bloom Tees" });
    expect(csv.channel === "etsy" && csv.mode).toBe("csv");
  });
});

describe("channel rules", () => {
  it("has valid rules for every channel with the documented Etsy limits and fees", () => {
    for (const c of CHANNELS) expect(ChannelRules.parse(CHANNEL_RULES[c]).channel).toBe(c);
    expect(CHANNEL_RULES.etsy.listing).toMatchObject({ titleMax: 140, tagsMax: 13, tagMaxLen: 20 });
    expect(CHANNEL_RULES.etsy.fees).toMatchObject({
      transactionPct: 6.5,
      listingFeeCents: 20,
      paymentPct: 3,
      paymentFixedCents: 25,
    });
    expect(CHANNEL_RULES.amazon.fees.transactionPct).toBe(17);
    expect(CHANNEL_RULES.tiktok.fees.transactionPct).toBe(8);
    expect(CHANNEL_RULES.walmart.fees.transactionPct).toBe(15);
    expect(CHANNEL_RULES.shopify.fees).toMatchObject({ paymentPct: 2.9, paymentFixedCents: 30 });
  });
});

describe("events", () => {
  it("outbox payloads validate and reject junk", () => {
    expect(
      Events["item.state_changed"].parse({
        orderItemId: id,
        orderId: id,
        from: "ready",
        to: "on_sheet",
        station: null,
        userId: null,
      }).to,
    ).toBe("on_sheet");
    expect(() => Events["stock.low"].parse({ blankVariantId: "nope" })).toThrow();
  });

  it("realtime events parse through the helper", () => {
    expect(
      parseRealtimeEvent("job.progress", {
        jobId: id,
        kind: "build_sheets",
        status: "running",
        progress: 0.4,
        message: null,
        resultIds: [],
      })?.progress,
    ).toBe(0.4);
    expect(parseRealtimeEvent("scan.result", { nope: true })).toBeNull();
    expect(Object.keys(RealtimeEvents)).toContain("sheet.status_changed");
  });
});
