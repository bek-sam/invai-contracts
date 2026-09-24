import { z } from "zod";
import { ALERT_KINDS, Alert } from "../schemas/alerts";
import { Id, Page, paginated } from "../schemas/common";
import { base, proc } from "./_base";

export const alerts = base
  .prefix("/alerts")
  .tag("alerts")
  .router({
    list: proc("alerts.read", { auth: "floor" })
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          unreadOnly: z.boolean().default(false),
          kind: z.array(z.enum(ALERT_KINDS)).optional(),
          severity: z.array(z.enum(["info", "warning", "critical"])).optional(),
        }),
      )
      .output(paginated(Alert).extend({ unread: z.number().int().nonnegative() })),
    markRead: proc("alerts.read", { auth: "floor" })
      .route({ method: "POST", path: "/read" })
      .input(z.object({ ids: z.array(Id).min(1).max(500) }))
      .output(z.object({ updated: z.number().int().nonnegative() })),
    markAllRead: proc("alerts.read")
      .route({ method: "POST", path: "/read-all" })
      .input(z.object({}))
      .output(z.object({ updated: z.number().int().nonnegative() })),
  });
