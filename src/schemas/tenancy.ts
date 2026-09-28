import { z } from "zod";
import { PERMISSIONS, ROLES } from "../roles";
import { STATIONS } from "../states";
import { Address, Id, Timestamp } from "./common";

export const ORG_TYPES = ["shop", "vendor"] as const;
export const OrgType = z.enum(ORG_TYPES);
export type OrgType = z.infer<typeof OrgType>;

export const RoleSchema = z.enum(ROLES);
export const PermissionSchema = z.enum(PERMISSIONS);

export const PLAN_KEYS = ["trial", "starter", "growth", "pro", "scale"] as const;
export const PlanKey = z.enum(PLAN_KEYS);
export type PlanKey = z.infer<typeof PlanKey>;

/** `companies.settings.productionPartner`. Etsy requires production-partner disclosure. */
export const ProductionPartner = z.object({
  name: z.string().min(1),
  /** Blank until the Etsy adapter is authorized (no live partner IDs yet). */
  etsyPartnerId: z.string().nullable(),
});
export type ProductionPartner = z.infer<typeof ProductionPartner>;

export const Org = z.object({
  id: Id,
  type: OrgType,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(), // IANA, e.g. America/Phoenix
  plan: PlanKey.nullable(), // null for vendor orgs (the portal is free)
  demo: z.boolean(),
  /** This user's own sample workspace (tenancy.demo, `companies.demoOwnerUserId`), not merely a
   * shop flagged `demo` (the seeded Desert Bloom has `demo: true` and `demoOwned: false`). B-110:
   * the web detects the sample workspace by this, not by the `demo-<id>` slug heuristic. */
  demoOwned: z.boolean(),
  /** The shop prints its own DTF sheets (ready → printing → printed, no vendor). */
  printsInHouse: z.boolean(),
  /** The outside shop that presses/ships for this org, if any (Etsy production-partner disclosure). */
  productionPartner: ProductionPartner.nullable(),
  createdAt: Timestamp,
});
export type Org = z.infer<typeof Org>;

export const USER_STATUSES = ["active", "invited", "deactivated"] as const;

export const User = z.object({
  id: Id,
  email: z.email(), // always a real (possibly synthetic, non-deliverable) string
  name: z.string(),
  role: RoleSchema,
  status: z.enum(USER_STATUSES),
  hasPin: z.boolean(), // floor PIN set (never returned)
  pinOnly: z.boolean().default(false), // NEW: PIN-only floor staff, can't sign in on the web
  lastSeenAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type User = z.infer<typeof User>;

export const OnboardingChecklist = z.object({
  channelConnected: z.boolean(),
  blanksImported: z.boolean(),
  skusMapped: z.boolean(),
  vendorAdded: z.boolean(),
  staffInvited: z.boolean(),
  shipFromAddress: z.boolean(), // NEW: Location.address or ShippingSettings.fromAddress set
  carrier: z.boolean(), // NEW: ShippingSettings.allowedCarriers non-empty
  tabletPaired: z.boolean(), // NEW: any StationDevice has tokenIssuedAt set
  designsUploaded: z.boolean(), // NEW: catalog designs count > 0
  costsSet: z.boolean(), // NEW: any blank/design cost record set
  planChosen: z.boolean(), // NEW: subscription.status !== "trialing", or a plan was explicitly picked
  dismissed: z.boolean(), // NEW
  dismissedAt: Timestamp.nullable(), // NEW
});

/** Who is calling: the user, the active org, the role and its expanded permissions. */
export const Me = z.object({
  user: User,
  org: Org,
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
  /** Every org the user belongs to, for the org switcher. */
  orgs: z.array(z.object({ id: Id, name: z.string(), type: OrgType, role: RoleSchema })),
  /** Present for floor sessions only. */
  station: z.object({ id: Id, name: z.string(), kind: z.enum(STATIONS).nullable() }).nullable(),
  onboarding: OnboardingChecklist.nullable(), // null for vendor orgs
});
export type Me = z.infer<typeof Me>;

export const Location = z.object({
  id: Id,
  name: z.string(),
  address: Address.nullable(),
  isDefault: z.boolean(),
  createdAt: Timestamp,
});
export type Location = z.infer<typeof Location>;

export const LocationInput = z.object({
  name: z.string().min(1),
  address: Address.nullable().default(null),
  isDefault: z.boolean().default(false),
});

/** A tablet or scanner post. Signed in as the org with a station token; staff add a PIN. */
export const StationDevice = z.object({
  id: Id,
  name: z.string(),
  locationId: Id,
  /** Default station screen; null lets staff pick on the tablet. */
  kind: z.enum(STATIONS).nullable(),
  active: z.boolean(),
  tokenIssuedAt: Timestamp.nullable(),
  lastSeenAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export type StationDevice = z.infer<typeof StationDevice>;

export const StationInput = z.object({
  name: z.string().min(1),
  locationId: Id,
  kind: z.enum(STATIONS).nullable().default(null),
});

/** Returned once; the tablet stores it. Sent as `Authorization: Station <token>`. */
export const StationToken = z.object({
  stationId: Id,
  token: z.string(),
  expiresAt: Timestamp.nullable(),
});

export const FloorLoginInput = z.object({
  /** Optional when the request already carries the station token header. */
  stationToken: z.string().optional(),
  pin: z.string().regex(/^\d{4,6}$/),
});

/** A floor session: a staff member on a station. Sent as `Authorization: Bearer <sessionToken>`. */
export const FloorSession = z.object({
  sessionToken: z.string(),
  expiresAt: Timestamp,
  user: z.object({ id: Id, name: z.string(), role: RoleSchema }),
  station: z.object({ id: Id, name: z.string(), kind: z.enum(STATIONS).nullable() }),
  permissions: z.array(PermissionSchema),
});
export type FloorSession = z.infer<typeof FloorSession>;

/**
 * Per-person email preferences keyed by kind (wave 19, A1). Every kind is opt-in: the default is
 * off, and only the person can turn it on (`me.notifications.set`); an admin or an unsubscribe
 * link can only turn it off. Values are appended at the end; the backend's `notify.ts` mirrors them.
 */
export const NOTIFICATION_KINDS = ["digest"] as const;
export const NotificationKind = z.enum(NOTIFICATION_KINDS);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** Who last changed the preference: the person in Settings/Account, a one-click unsubscribe link, or an admin. */
export const NOTIFICATION_PREFERENCE_SOURCES = ["settings", "unsubscribe_link", "admin"] as const;
export const NotificationPreferenceSource = z.enum(NOTIFICATION_PREFERENCE_SOURCES);
export type NotificationPreferenceSource = z.infer<typeof NotificationPreferenceSource>;

/** `source` and `updatedAt` are null while the preference was never set (default off). */
export const NotificationPreference = z.object({
  kind: NotificationKind,
  on: z.boolean(),
  source: NotificationPreferenceSource.nullable(),
  updatedAt: Timestamp.nullable(),
});
export type NotificationPreference = z.infer<typeof NotificationPreference>;

/** One row per kind in `NOTIFICATION_KINDS`, in that order, whether or not it was ever set. */
export const NotificationPreferences = z.object({
  items: z.array(NotificationPreference),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferences>;

export const NotificationPreferenceSetInput = z.object({
  kind: NotificationKind,
  on: z.boolean(),
});
export type NotificationPreferenceSetInput = z.infer<typeof NotificationPreferenceSetInput>;

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.floor_login",
  "team.invite",
  "team.role_changed",
  "team.deactivated",
  "team.pin_set",
  "station.token_issued",
  "item.state_changed",
  "order.held",
  "order.released",
  "order.cancelled",
  "scan.recorded",
  "sheet.sent",
  "inventory.adjusted",
  "label.bought",
  "label.voided",
  "settings.changed",
  "data.exported",
  "listing.approved",
  "listing.published",
  "listing_draft.trademark_review",
  "tenant.export_requested",
  "tenant.delete_requested",
  "tenant.delete_cancelled",
  "tenant.purged",
] as const;

export const AuditEntry = z.object({
  id: Id,
  at: Timestamp,
  action: z.enum(AUDIT_ACTIONS),
  actor: z.object({ userId: Id.nullable(), name: z.string(), stationId: Id.nullable() }),
  entityType: z.string(), // e.g. "order_item"
  entityId: Id.nullable(),
  summary: z.string(),
  meta: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
