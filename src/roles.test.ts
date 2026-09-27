import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "./roles";

describe("ROLE_PERMISSIONS", () => {
  it("defines every role with known permissions only", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      for (const p of ROLE_PERMISSIONS[role]) expect(PERMISSIONS).toContain(p);
      expect(new Set(ROLE_PERMISSIONS[role]).size).toBe(ROLE_PERMISSIONS[role].length);
    }
  });

  it("owner has every shop permission; admin everything but billing.manage", () => {
    const shopPerms = PERMISSIONS.filter((p) => !p.startsWith("vendor_portal."));
    for (const p of shopPerms) expect(hasPermission("owner", p), p).toBe(true);
    expect(hasPermission("admin", "billing.manage")).toBe(false);
    // Whole-company export and deletion are the owner's alone (B-23).
    for (const p of ["org.export", "org.delete"] as const)
      for (const role of ROLES.filter((r) => r !== "owner"))
        expect(hasPermission(role, p), role).toBe(false);
    expect(hasPermission("admin", "team.manage")).toBe(true);
  });

  it("vendor role is confined to the portal", () => {
    expect(hasPermission("vendor", "vendor_portal.update")).toBe(true);
    expect(hasPermission("vendor", "orders.read")).toBe(false);
    expect(hasPermission("vendor", "production.read")).toBe(false);
    for (const role of ROLES.filter((r) => r !== "vendor")) {
      expect(hasPermission(role, "vendor_portal.read"), role).toBe(false);
    }
  });

  it("floor roles can scan but not build sheets or buy labels (except packers)", () => {
    for (const role of ["presser", "packer", "receiver"] as const) {
      expect(hasPermission(role, "production.scan")).toBe(true);
      expect(hasPermission(role, "production.build")).toBe(false);
      expect(hasPermission(role, "finance.read")).toBe(false);
    }
    expect(hasPermission("packer", "shipping.buy")).toBe(true);
    expect(hasPermission("presser", "shipping.buy")).toBe(false);
    expect(hasPermission("receiver", "purchasing.receive")).toBe(true);
  });

  it("market.niches.manage: shop admins, office and designer; never floor roles or vendors", () => {
    for (const role of ["owner", "admin", "office", "designer"] as const)
      expect(hasPermission(role, "market.niches.manage"), role).toBe(true);
    for (const role of ["presser", "packer", "receiver", "vendor"] as const)
      expect(hasPermission(role, "market.niches.manage"), role).toBe(false);
  });

  it("every permission is granted to at least one role", () => {
    for (const p of PERMISSIONS) {
      expect(
        ROLES.some((r) => hasPermission(r, p)),
        p,
      ).toBe(true);
    }
  });
});
