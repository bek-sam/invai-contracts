import { z } from "zod";
import { Id, Ok, Page, paginated } from "../schemas/common";
import { SheetDownloadUrls } from "../schemas/production";
import {
  SheetSpec,
  VendorConnection,
  VendorInboxSheet,
  VendorInboxSheetDetail,
  VendorInviteInput,
  VendorShop,
} from "../schemas/vendors";
import { SHEET_STATES } from "../states";
import { base, proc } from "./_base";

/** Shop side: the DTF vendors this shop sends sheets to. */
export const vendors = base
  .prefix("/vendors")
  .tag("vendors")
  .router({
    list: proc("vendors.read")
      .route({ method: "GET", path: "/" })
      .input(z.object({}))
      .output(z.object({ items: z.array(VendorConnection) })),
    get: proc("vendors.read")
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(VendorConnection),
    /**
     * Invite a vendor by email. If the email belongs to an existing vendor org the connection
     * is active immediately; otherwise an invite email creates the vendor org on acceptance and
     * sheets go out by email with a download link meanwhile.
     */
    invite: proc("vendors.manage")
      .route({ method: "POST", path: "/invite" })
      .input(VendorInviteInput)
      .output(VendorConnection),
    update: proc("vendors.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(
        z.object({
          id: Id,
          name: z.string().min(1).optional(),
          spec: SheetSpec.partial().optional(),
          turnaroundDays: z.number().int().nonnegative().optional(),
          status: z.enum(["active", "paused"]).optional(),
        }),
      )
      .output(VendorConnection),
    setDefault: proc("vendors.manage")
      .route({ method: "POST", path: "/{id}/default" })
      .input(z.object({ id: Id }))
      .output(VendorConnection),
    remove: proc("vendors.manage")
      .route({ method: "DELETE", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(Ok)
      .errors({
        VENDOR_HAS_OPEN_SHEETS: {
          status: 409,
          message: "Vendor still has open sheets",
          data: z.object({ sheetsOpen: z.number() }),
        },
      }),
  });

/** Vendor side: one inbox for sheets from every shop that shares with this vendor org. */
export const vendorPortal = base
  .prefix("/vendor-portal")
  .tag("vendor-portal")
  .router({
    inbox: proc("vendor_portal.read")
      .route({ method: "GET", path: "/inbox" })
      .input(
        Page.extend({ status: z.array(z.enum(SHEET_STATES)).optional(), shopOrgId: Id.optional() }),
      )
      .output(
        paginated(VendorInboxSheet).extend({
          counts: z.record(z.enum(SHEET_STATES), z.number().int().nonnegative()),
        }),
      ),
    get: proc("vendor_portal.read")
      .route({ method: "GET", path: "/sheets/{id}" })
      .input(z.object({ id: Id }))
      .output(VendorInboxSheetDetail),
    acknowledge: proc("vendor_portal.update")
      .route({ method: "POST", path: "/sheets/{id}/acknowledge" })
      .input(z.object({ id: Id }))
      .output(VendorInboxSheet),
    markPrinted: proc("vendor_portal.update")
      .route({ method: "POST", path: "/sheets/{id}/printed" })
      .input(z.object({ id: Id }))
      .output(VendorInboxSheet),
    markShipped: proc("vendor_portal.update")
      .route({ method: "POST", path: "/sheets/{id}/shipped" })
      .input(
        z.object({
          id: Id,
          carrier: z.string().min(1),
          trackingCode: z.string().min(1),
          note: z.string().max(500).optional(),
        }),
      )
      .output(VendorInboxSheet),
    /** Flag a problem back to the shop (bad file, oversize); the sheet moves to `failed`. */
    reject: proc("vendor_portal.update")
      .route({ method: "POST", path: "/sheets/{id}/reject" })
      .input(z.object({ id: Id, reason: z.string().min(1).max(500) }))
      .output(VendorInboxSheet),
    downloadUrls: proc("vendor_portal.read")
      .route({ method: "GET", path: "/sheets/{id}/downloads" })
      .input(z.object({ id: Id }))
      .output(SheetDownloadUrls),
    shops: proc("vendor_portal.read")
      .route({ method: "GET", path: "/shops" })
      .input(z.object({}))
      .output(z.object({ items: z.array(VendorShop) })),
  });
