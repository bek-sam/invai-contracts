import { z } from "zod";
import { FLOOR_ROLES, ROLES } from "../roles";
import { Id, Ok, Page, paginated, Timestamp } from "../schemas/common";
import {
  AUDIT_ACTIONS,
  AuditEntry,
  FloorLoginInput,
  FloorSession,
  Location,
  LocationInput,
  Me,
  NotificationPreferenceSetInput,
  NotificationPreferences,
  Org,
  ProductionPartner,
  StationDevice,
  StationInput,
  StationToken,
  User,
} from "../schemas/tenancy";
import { base, proc } from "./_base";

export const me = base
  .prefix("/me")
  .tag("me")
  .router({
    /** Current user, active org, role, permissions. Works for web and floor sessions. */
    get: proc("none", { auth: "floor" })
      .route({ method: "GET", path: "/" })
      .input(z.object({}))
      .output(Me),
    switchOrg: proc("none")
      .route({ method: "POST", path: "/switch-org" })
      .input(z.object({ orgId: Id }))
      .output(Me),
    updateOrg: proc("org.manage")
      .route({ method: "PATCH", path: "/org" })
      .input(
        z.object({
          name: z.string().min(1).optional(),
          timezone: z.string().optional(),
          printsInHouse: z.boolean().optional(),
          productionPartner: ProductionPartner.nullable().optional(),
          /** B-162: settable here (stored in `companies.settings`), read by ship-by math. */
          shipsSaturday: z.boolean().optional(),
          /** B-35: days after printing at which a transfer gets the age warning (default 30). */
          transferAgeWarnDays: z.number().int().min(1).max(365).optional(),
        }),
      )
      .output(Org),
    /**
     * The caller's own email preferences, keyed by kind (wave 19, A1). `org.read` because every
     * signed-in member of any org holds it, and `none` stays reserved for the five bootstrap
     * procedures. Implementer: backend-foundation, T-19-4.
     */
    notifications: base.prefix("/notifications").router({
      /** One row per `NOTIFICATION_KINDS` entry, default off, never set = `source: null`. */
      get: proc("org.read")
        .route({ method: "GET", path: "/" })
        .input(z.object({}))
        .output(NotificationPreferences),
      /** Turns one kind on or off for the caller, source `settings`. Idempotent; returns all rows. */
      set: proc("org.read")
        .route({ method: "PUT", path: "/" })
        .input(NotificationPreferenceSetInput)
        .output(NotificationPreferences),
    }),
  });

export const team = base
  .prefix("/team")
  .tag("team")
  .router({
    list: proc("team.read")
      .route({ method: "GET", path: "/" })
      .input(Page.extend({ includeDeactivated: z.boolean().default(false) }))
      .output(paginated(User)),
    /**
     * `pinOnly: true` (floor roles only) creates a PIN-only member with no email login: the
     * backend fills a synthetic, non-deliverable placeholder email (Better Auth's `users`
     * table requires one) and the web/mailer must never treat it as a real address.
     */
    invite: proc("team.manage")
      .route({ method: "POST", path: "/invite" })
      .input(
        z
          .object({
            name: z.string().min(1),
            role: z.enum(ROLES),
            email: z.email().optional(),
            pinOnly: z.boolean().default(false),
          })
          .refine((v) => v.pinOnly || !!v.email, {
            message: "email is required unless pinOnly",
            path: ["email"],
          })
          .refine((v) => !v.pinOnly || (FLOOR_ROLES as readonly string[]).includes(v.role), {
            message: "pinOnly staff must be a floor role (presser, packer or receiver)",
            path: ["role"],
          }),
      )
      .output(User),
    /** Re-sends the invitation email (resets its expiry). No-op target for `pinOnly` members. */
    resend: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/resend" })
      .input(z.object({ userId: Id }))
      .output(User)
      .errors({
        NOT_INVITED: { status: 409, message: "This teammate has no pending invitation" },
      }),
    /** Cancels a pending invitation; the seat is freed. */
    revoke: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/revoke" })
      .input(z.object({ userId: Id }))
      .output(Ok)
      .errors({
        NOT_INVITED: { status: 409, message: "This teammate has no pending invitation" },
      }),
    changeRole: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/role" })
      .input(z.object({ userId: Id, role: z.enum(ROLES) }))
      .output(User),
    deactivate: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/deactivate" })
      .input(z.object({ userId: Id }))
      .output(User),
    reactivate: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/reactivate" })
      .input(z.object({ userId: Id }))
      .output(User),
    /** Floor PIN (4-6 digits), unique per org. Owners/admins set it; the PIN is never returned. */
    setPin: proc("team.manage")
      .route({ method: "POST", path: "/{userId}/pin" })
      .input(z.object({ userId: Id, pin: z.string().regex(/^\d{4,6}$/) }))
      .output(Ok),
  });

export const locations = base
  .prefix("/locations")
  .tag("tenancy")
  .router({
    list: proc("org.read")
      .route({ method: "GET", path: "/" })
      .input(z.object({}))
      .output(z.object({ items: z.array(Location) })),
    create: proc("org.manage")
      .route({ method: "POST", path: "/" })
      .input(LocationInput)
      .output(Location),
    update: proc("org.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(LocationInput.partial().extend({ id: Id }))
      .output(Location),
    delete: proc("org.manage")
      .route({ method: "DELETE", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(Ok),
  });

export const stations = base
  .prefix("/stations")
  .tag("tenancy")
  .router({
    list: proc("org.read")
      .route({ method: "GET", path: "/" })
      .input(z.object({ locationId: Id.optional() }))
      .output(z.object({ items: z.array(StationDevice) })),
    create: proc("stations.manage")
      .route({ method: "POST", path: "/" })
      .input(StationInput)
      .output(StationDevice),
    update: proc("stations.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(StationInput.partial().extend({ id: Id, active: z.boolean().optional() }))
      .output(StationDevice),
    /** Issues a new station token (revokes the previous one). Shown once as a QR/text for the tablet. */
    issueToken: proc("stations.manage")
      .route({ method: "POST", path: "/{id}/token" })
      .input(z.object({ id: Id }))
      .output(StationToken),
    revokeToken: proc("stations.manage")
      .route({ method: "DELETE", path: "/{id}/token" })
      .input(z.object({ id: Id }))
      .output(Ok),
  });

export const floor = base
  .prefix("/floor")
  .tag("floor")
  .router({
    /** Station token + PIN -> floor session for the staff member who owns the PIN. */
    login: proc("none", { auth: "station" })
      .route({ method: "POST", path: "/login" })
      .input(FloorLoginInput)
      .output(FloorSession)
      .errors({
        INVALID_PIN: { status: 401, message: "PIN not recognized" },
        STATION_INACTIVE: { status: 403, message: "Station is inactive" },
      }),
    logout: proc("none", { auth: "floor" })
      .route({ method: "POST", path: "/logout" })
      .input(z.object({}))
      .output(Ok),
    /** Staff on this station who can log in, for the PIN screen (names only). */
    staff: proc("none", { auth: "station" })
      .route({ method: "GET", path: "/staff" })
      .input(z.object({}))
      .output(
        z.object({ items: z.array(z.object({ id: Id, name: z.string(), role: z.enum(ROLES) })) }),
      ),
  });

export const audit = base
  .prefix("/audit")
  .tag("tenancy")
  .router({
    list: proc("audit.read")
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          action: z.enum(AUDIT_ACTIONS).optional(),
          actorUserId: Id.optional(),
          entityType: z.string().optional(),
          entityId: Id.optional(),
          from: Timestamp.optional(),
          to: Timestamp.optional(),
        }),
      )
      .output(paginated(AuditEntry)),
  });

/**
 * One demo company per user (found by `companies.demoOwnerUserId`, not by which real org the
 * user clicked from). Sample-data workspace, isolated by the same `company_id` RLS as any
 * other company, excluded from billing, marketplace calls and mail. All three return `Me` —
 * the same shape `me.switchOrg` returns — so the web client updates its session context in one
 * call instead of a call-then-refetch.
 *
 * Permission: `today.read` — shop-only (every shop role holds it, vendor doesn't; `demo` is a
 * shop-only concept and pairs with the Today screen's demo entry point), not `none` (`none` is
 * reserved for the five auth-bootstrap procedures; `contract.test.ts` enforces the exact list)
 * and not `org.read` (vendor holds that one too, which let vendor orgs reach `demo.*`).
 */
export const demo = base
  .prefix("/tenancy/demo")
  .tag("tenancy")
  .router({
    /** Finds or creates, then (re)seeds, this user's demo company and switches into it. */
    start: proc("today.read")
      .route({ method: "POST", path: "/start" })
      .input(z.object({}))
      .output(Me),
    /** Wipes and reseeds the demo company found by `demoOwnerUserId`. */
    reset: proc("today.read")
      .route({ method: "POST", path: "/reset" })
      .input(z.object({}))
      .output(Me),
    /** Switches back to the user's primary org; the demo company is kept, not deleted. */
    leave: proc("today.read")
      .route({ method: "POST", path: "/leave" })
      .input(z.object({}))
      .output(Me),
  });
