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
  "org.export", // whole-company data export (owner only)
  "org.delete", // whole-company deletion request and cancel (owner only)
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
  "production.override", // hand a short order to a lead when units are missing
  "production.receive", // mark vendor sheets / blank POs received on the floor
  // Close a station for maintenance and reopen it (B-35, wave 22). Its own permission because
  // `stations.manage` (create stations, issue tokens) is owner/admin only, while the office lead
  // must be able to close a press, and presser/packer must not.
  "production.maintenance",
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
  // market signals (wave 18). Correcting a design's niche: office lacks catalog.manage and no
  // existing permission fits, so it gets its own. Reading niches is catalog.read;
  // recommendations are finance.read.
  "market.niches.manage",
  // Listing photos (wave 26, ADR 0023): same tier as managing AI listing drafts (owner, admin,
  // office, designer). Its own pair so the photo credits and approvals can be audited apart.
  "photos.read",
  "photos.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SHOP_ALL = PERMISSIONS.filter((p) => !p.startsWith("vendor_portal."));

/** Permissions only the company owner holds, never a bare admin. */
const OWNER_ONLY: Permission[] = ["billing.manage", "org.export", "org.delete"];

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
  "production.maintenance",
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
  "market.niches.manage",
  "photos.read",
  "photos.manage",
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
  "market.niches.manage",
  "photos.read",
  "photos.manage",
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
  // Owner-only actions: billing, and exporting or deleting the whole company (B-23).
  admin: SHOP_ALL.filter((p) => !OWNER_ONLY.includes(p)),
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
