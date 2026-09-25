/**
 * Roles and permissions. Every procedure declares one permission in its `.meta`
 * (see contract/_base.ts); the backend checks `ROLE_PERMISSIONS[role]` includes it.
 * Vendor organizations only ever have the `vendor` role.
 */

export const ROLES = [
  "owner",
  "admin",
  "office",
  "designer",
  "presser",
  "packer",
  "receiver",
  "vendor",
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that exist in a shop org. `vendor` is the single role of a vendor org. */
export const SHOP_ROLES = [
  "owner",
  "admin",
  "office",
  "designer",
  "presser",
  "packer",
  "receiver",
] as const;

/** Roles that log in on a floor station with a PIN. */
export const FLOOR_ROLES = ["presser", "packer", "receiver"] as const;

export const PERMISSIONS = [
  // tenancy
  "org.read",
  "org.manage",
  "team.read",
  "team.manage",
  "stations.manage",
  "audit.read",
  "today.read",
  // orders
  "orders.read",
  "orders.manage", // hold, release, cancel
  "orders.map", // manual map, artwork override, flags
  // channels + SKU mapper
  "channels.read",
  "channels.manage",
  "channels.import",
  "sku_rules.read",
  "sku_rules.manage",
  // catalog + files
  "catalog.read",
  "catalog.manage",
  "files.upload",
  "files.read",
  // personalization
  "personalization.read",
  "personalization.manage",
  "artwork.approve",
  // production
  "production.read",
  "production.build", // batches, sheets, send to vendor, regenerate
  "production.scan", // station scans, bins
  "production.qc", // QC pass/fail, reprint requests
  "production.override", // pack an order anyway when units are missing
  "production.receive", // mark vendor sheets / blank POs received on the floor
  // vendors (shop side) and vendor portal (vendor side)
  "vendors.read",
  "vendors.manage",
  "vendor_portal.read",
  "vendor_portal.update",
  // inventory + purchasing
  "inventory.read",
  "inventory.adjust",
  "inventory.count",
  "purchasing.read",
  "purchasing.manage",
  "purchasing.receive",
  // shipping
  "shipping.read",
  "shipping.buy",
  "shipping.manage",
  // finance
  "finance.read",
  "finance.manage",
  // ai
  "ai.listings.read",
  "ai.listings.manage",
  "ai.listings.approve",
  "ai.trademark.check",
  "ai.assistant.ask",
  "ai.credits.read",
  // billing + alerts
  "billing.read",
  "billing.manage",
  "alerts.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SHOP_ALL = PERMISSIONS.filter((p) => !p.startsWith("vendor_portal."));

const OFFICE: Permission[] = [
  "org.read",
  "team.read",
  "audit.read",
  "today.read",
  "orders.read",
  "orders.manage",
  "orders.map",
  "channels.read",
  "channels.manage",
  "channels.import",
  "sku_rules.read",
  "sku_rules.manage",
  "catalog.read",
  "files.upload",
  "files.read",
  "personalization.read",
  "personalization.manage",
  "artwork.approve",
  "production.read",
  "production.build",
  "production.qc",
  "production.receive",
  "vendors.read",
  "vendors.manage",
  "inventory.read",
  "purchasing.read",
  "purchasing.manage",
  "shipping.read",
  "shipping.buy",
  "shipping.manage",
  "finance.read",
  "ai.listings.read",
  "ai.listings.manage",
  "ai.trademark.check",
  "ai.assistant.ask",
  "ai.credits.read",
  "alerts.read",
];

const DESIGNER: Permission[] = [
  "org.read",
  "team.read",
  "today.read",
  "orders.read",
  "orders.map",
  "catalog.read",
  "catalog.manage",
  "files.upload",
  "files.read",
  "personalization.read",
  "personalization.manage",
  "artwork.approve",
  "production.read",
  "ai.listings.read",
  "ai.listings.manage",
  "ai.trademark.check",
  "ai.credits.read",
  "alerts.read",
];

const PRESSER: Permission[] = [
  "org.read",
  "today.read",
  "orders.read",
  "files.read",
  "production.read",
  "production.scan",
  "production.qc",
];

const PACKER: Permission[] = [
  "org.read",
  "today.read",
  "orders.read",
  "files.read",
  "production.read",
  "production.scan",
  "production.qc",
  "shipping.read",
  "shipping.buy",
];

const RECEIVER: Permission[] = [
  "org.read",
  "today.read",
  "files.read",
  "production.read",
  "production.scan",
  "production.receive",
  "inventory.read",
  "inventory.adjust",
  "inventory.count",
  "purchasing.read",
  "purchasing.receive",
];

const VENDOR: Permission[] = [
  "org.read",
  "team.read",
  "team.manage",
  "files.read",
  "vendor_portal.read",
  "vendor_portal.update",
  "alerts.read",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: SHOP_ALL,
  admin: SHOP_ALL.filter((p) => p !== "billing.manage"),
  office: OFFICE,
  designer: DESIGNER,
  presser: PRESSER,
  packer: PACKER,
  receiver: RECEIVER,
  vendor: VENDOR,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
