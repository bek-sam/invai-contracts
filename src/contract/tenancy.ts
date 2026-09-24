import { z } from "zod";
import { ROLES } from "../roles";
import { Id, Ok, Page, paginated, Timestamp } from "../schemas/common";
import {
  AUDIT_ACTIONS,
  AuditEntry,
  FloorLoginInput,
  FloorSession,
  Location,
  LocationInput,
  Me,
  Org,
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
      .input(z.object({ name: z.string().min(1).optional(), timezone: z.string().optional() }))
      .output(Org),
  });

export const team = base
  .prefix("/team")
  .tag("team")
  .router({
    list: proc("team.read")
      .route({ method: "GET", path: "/" })
      .input(Page.extend({ includeDeactivated: z.boolean().default(false) }))
      .output(paginated(User)),
    invite: proc("team.manage")
      .route({ method: "POST", path: "/invite" })
      .input(z.object({ email: z.email(), name: z.string().min(1), role: z.enum(ROLES) }))
      .output(User),
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
