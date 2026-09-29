/**
 * Wave 22, T-22-1: contract additions for the P2 sweep (B-25, B-32, B-35, B-102, B-162, B-164,
 * B-167). Everything here is additive; this file pins the exact version so older waves' tests
 * only assert "at least".
 */
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { Events } from "./events";
import { parseRealtimeEvent } from "./realtime";
import { hasPermission, type Permission, ROLES } from "./roles";
import { ListingContent } from "./schemas/ai";
import {
  MAINTENANCE_REASONS,
  MaintenanceEndInput,
  MaintenanceEndResult,
  MaintenanceStartInput,
  MaintenanceStartResult,
  MISMATCH_REASONS,
  QueueItem,
  ScanResult,
  StationMaintenance,
} from "./schemas/production";
import {
  AddressVerification,
  Rate,
  SCAN_FORM_CARRIERS,
  ScanForm,
  ScanFormCreateInput,
} from "./schemas/shipping";
import { Org } from "./schemas/tenancy";

const id = "5f1c6c2a-0d5b-4a1e-9b8e-3a2f1c4d5e6f";
const at = "2026-09-28T14:00:00.000Z";
const procedures = listProcedures(contract);
const byPath = new Map(procedures.map((p) => [p.path, p]));

describe("T-22-1 procedures: route, permission, auth", () => {
  const expected: Record<
    string,
    { method: string; httpPath: string; permission: Permission; auth?: string }
  > = {
    "shipping.scanForms.create": {
      method: "POST",
      httpPath: "/shipping/scan-forms/",
      permission: "shipping.manage",
    },
    "shipping.scanForms.list": {
      method: "GET",
      httpPath: "/shipping/scan-forms/",
      permission: "shipping.read",
    },
    "shipping.scanForms.get": {
      method: "GET",
      httpPath: "/shipping/scan-forms/{id}",
      permission: "shipping.read",
    },
    "shipping.verifyAddress": {
      method: "POST",
      httpPath: "/shipping/verify-address",
      permission: "shipping.manage",
    },
    "production.maintenance.start": {
      method: "POST",
      httpPath: "/production/maintenance/start",
      permission: "production.maintenance",
    },
    "production.maintenance.end": {
      method: "POST",
      httpPath: "/production/maintenance/end",
      permission: "production.maintenance",
    },
    "production.maintenance.list": {
      method: "GET",
      httpPath: "/production/maintenance/",
      permission: "production.read",
      auth: "floor",
    },
    "vendors.sheets.resendEmail": {
      method: "POST",
      httpPath: "/vendors/sheets/{sheetId}/resend-email",
      permission: "vendors.manage",
    },
  };

  it.each(Object.entries(expected))("%s", (path, e) => {
    const p = byPath.get(path);
    expect(p, path).toBeDefined();
    expect(p?.method).toBe(e.method);
    expect(p?.httpPath).toBe(e.httpPath);
    expect(p?.meta.permission).toBe(e.permission);
    expect(p?.meta.auth ?? "user").toBe(e.auth ?? "user");
    expect(PROCEDURE_PERMISSIONS[path]).toBe(e.permission);
  });

  it("packers and pressers can't open a SCAN form or close a station; office can", () => {
    for (const role of ["presser", "packer", "receiver", "vendor"] as const) {
      expect(hasPermission(role, "shipping.manage"), role).toBe(false);
      expect(hasPermission(role, "production.maintenance"), role).toBe(false);
      expect(hasPermission(role, "vendors.manage"), role).toBe(false);
    }
    for (const role of ["owner", "admin", "office"] as const) {
      expect(hasPermission(role, "shipping.manage"), role).toBe(true);
      expect(hasPermission(role, "production.maintenance"), role).toBe(true);
      expect(hasPermission(role, "vendors.manage"), role).toBe(true);
    }
    // A tablet may read which stations are closed.
    for (const role of ROLES.filter((r) => r !== "vendor")) {
      expect(hasPermission(role, "production.read"), role).toBe(true);
    }
  });
});

describe("shipping schemas (B-25)", () => {
  it("Rate parses with and without expiresAt (older backends omit it)", () => {
    const rate = {
      rateId: "rate_1",
      carrier: "usps",
      service: "Priority",
      serviceLabel: "USPS Priority Mail",
      rate: 845,
      deliveryDays: 2,
      estimatedDeliveryAt: at,
      cheapest: true,
      fastest: false,
    };
    expect(Rate.parse(rate).expiresAt).toBeUndefined();
    expect(Rate.parse({ ...rate, expiresAt: at }).expiresAt).toBe(at);
    expect(() => Rate.parse({ ...rate, expiresAt: "tomorrow" })).toThrow();
  });

  it("ScanForm round-trips; create defaults the date to the shop's today", () => {
    const form = ScanForm.parse({
      id,
      carrier: "usps",
      date: "2026-09-28",
      labelCount: 12,
      shipmentIds: [id],
      carrierFormId: "sf_123",
      fileKey: "scan-forms/x/2026-09-28.pdf",
      createdAt: at,
    });
    expect(form.labelCount).toBe(12);
    expect(ScanFormCreateInput.parse({ carrier: "mock" }).date).toBeUndefined();
    expect(() => ScanFormCreateInput.parse({ carrier: "ups" })).toThrow();
    expect(SCAN_FORM_CARRIERS).not.toContain("ups");
  });

  it("AddressVerification carries a suggestion only when corrected", () => {
    const base = {
      orderId: id,
      status: "verified",
      suggestion: null,
      detail: null,
      verifiedAt: at,
    };
    expect(AddressVerification.parse(base).status).toBe("verified");
    const corrected = AddressVerification.parse({
      ...base,
      status: "corrected",
      suggestion: {
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
    });
    expect(corrected.suggestion?.country).toBe("US");
    expect(() => AddressVerification.parse({ ...base, status: "unknown" })).toThrow();
  });
});

describe("production schemas (B-35, B-32)", () => {
  it("station_maintenance is the last mismatch reason and stays a ScanResult, not an error", () => {
    expect(MISMATCH_REASONS.at(-1)).toBe("station_maintenance");
    expect(new Set(MISMATCH_REASONS).size).toBe(MISMATCH_REASONS.length);
    const blocked = ScanResult.parse({
      ok: false,
      clientScanId: id,
      mismatch: "station_maintenance",
      message: "Station closed for maintenance",
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
        shelf: "A-03-2",
        binCode: null,
      },
      scannedBlank: null,
      placement: "front",
      isReprint: false,
      binCode: null,
      itemState: "transfer_in",
      nextAction: "press",
      orderOpenUnits: 2,
      transferAgeDays: 41,
      transferAgeWarning: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.expected?.shelf).toBe("A-03-2");
    expect(blocked.transferAgeWarning).toBe(true);
    const errors = Object.keys(contract.production.scan["~orpc"].errorMap ?? {});
    expect(errors.some((e) => /MAINTENANCE/i.test(e))).toBe(false);
  });

  it("QueueItem accepts the blank location and transfer age, and still parses without them", () => {
    const item = {
      orderItemId: id,
      orderId: id,
      orderNo: "#1001",
      state: "transfer_in",
      shipBy: at,
      isRush: false,
      isReprint: false,
      design: { id, name: "Desert Bloom", code: "D1042" },
      placement: "front",
      blank: { variantId: id, brand: "Bella+Canvas", style: "3001", color: "Black", size: "M" },
      artworkPreviewKey: null,
      transferId: id,
      sheetId: id,
      sheetName: "2026-09-24 #1",
      binCode: "T-07",
      orderOpenUnits: 1,
    };
    expect(QueueItem.parse(item).transferAgeWarning).toBeUndefined();
    const full = QueueItem.parse({
      ...item,
      blank: { ...item.blank, shelf: "A-03-2", binCode: "B-12" },
      transferPrintedAt: at,
      transferAgeDays: 4,
      transferAgeWarning: false,
    });
    expect(full.blank.shelf).toBe("A-03-2");
    expect(full.binCode).toBe("T-07"); // the pack tote, unchanged
    expect(() => QueueItem.parse({ ...item, transferAgeDays: -1 })).toThrow();
  });

  it("maintenance windows round-trip and start/end are idempotent by result shape", () => {
    const window = StationMaintenance.parse({
      id,
      stationId: id,
      stationName: "Press 1",
      reason: "calibration",
      note: null,
      startedAt: at,
      startedBy: id,
      endedAt: null,
      endedBy: null,
    });
    expect(window.endedAt).toBeNull();
    expect(MaintenanceStartInput.parse({ stationId: id, reason: "cleaning" }).note).toBeNull();
    expect(() => MaintenanceStartInput.parse({ stationId: id, reason: "lunch" })).toThrow();
    expect(MaintenanceStartResult.parse({ maintenance: window, started: false }).started).toBe(
      false,
    );
    expect(MaintenanceEndInput.parse({ stationId: id }).note).toBeNull();
    expect(MaintenanceEndResult.parse({ maintenance: null, ended: false }).maintenance).toBeNull();
    expect(MAINTENANCE_REASONS.at(-1)).toBe("other");
  });

  it("station.maintenance_changed exists as an outbox and a realtime event", () => {
    expect(
      Events["station.maintenance_changed"].parse({
        stationId: id,
        maintenanceId: id,
        open: true,
        reason: "repair",
      }).open,
    ).toBe(true);
    expect(
      parseRealtimeEvent("station.maintenance_changed", { stationId: id, open: false })?.open,
    ).toBe(false);
    expect(parseRealtimeEvent("station.maintenance_changed", { stationId: "nope" })).toBeNull();
  });
});

describe("settings and listings (B-162, B-167)", () => {
  it("Org carries shipsSaturday and transferAgeWarnDays as optional fields", () => {
    const org = {
      id,
      type: "shop",
      name: "Desert Bloom Tees",
      slug: "desert-bloom",
      timezone: "America/Phoenix",
      plan: "starter",
      demo: false,
      demoOwned: false,
      printsInHouse: false,
      productionPartner: null,
      createdAt: at,
    };
    expect(Org.parse(org).shipsSaturday).toBeUndefined();
    expect(
      Org.parse({ ...org, shipsSaturday: true, transferAgeWarnDays: 45 }).transferAgeWarnDays,
    ).toBe(45);
    const input = contract.me.updateOrg["~orpc"].inputSchema as { shape: Record<string, unknown> };
    expect(input.shape).toHaveProperty("shipsSaturday");
    expect(input.shape).toHaveProperty("printsInHouse");
    expect(input.shape).toHaveProperty("transferAgeWarnDays");
  });

  it("ListingContent.attributes stays a string map (ADR 0017)", () => {
    const content = ListingContent.parse({
      title: "Desert Bloom Tee",
      description: "Soft cotton tee",
      tags: ["desert"],
      bullets: [],
      attributes: { material: "cotton", occasion: "everyday" },
      price: 2499,
      disclosures: [],
      productionPartner: null,
    });
    expect(content.attributes.material).toBe("cotton");
    expect(() =>
      ListingContent.parse({ ...content, attributes: [{ key: "material", value: "cotton" }] }),
    ).toThrow();
  });
});

describe("version", () => {
  it("is 0.8.0 (additive, minor bump on 0.x) and the floor baseline is untouched (ADR 0012)", () => {
    expect(CONTRACT_VERSION).toBe("0.8.0");
    expect(FLOOR_COMPAT_BASELINE).toBe("0.3.0");
  });
});
