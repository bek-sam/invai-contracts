import { z } from "zod";
import { Id, Ok, Page, paginated, Timestamp } from "../schemas/common";
import {
  ITEM_ARTWORK_STATUSES,
  ItemArtwork,
  PersonalizationTemplate,
  PersonalizationTemplateInput,
  RenderPreview,
} from "../schemas/personalization";
import { base, proc } from "./_base";

const templates = base.prefix("/templates").router({
  list: proc("personalization.read")
    .route({ method: "GET", path: "/" })
    .input(Page.extend({ search: z.string().optional() }))
    .output(paginated(PersonalizationTemplate)),
  get: proc("personalization.read")
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(PersonalizationTemplate),
  create: proc("personalization.manage")
    .route({ method: "POST", path: "/" })
    .input(PersonalizationTemplateInput)
    .output(PersonalizationTemplate),
  update: proc("personalization.manage")
    .route({ method: "PATCH", path: "/{id}" })
    .input(PersonalizationTemplateInput.partial().extend({ id: Id }))
    .output(PersonalizationTemplate),
  delete: proc("personalization.manage")
    .route({ method: "DELETE", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(Ok)
    .errors({
      TEMPLATE_IN_USE: {
        status: 409,
        message: "Designs still use this template",
        data: z.object({ designCount: z.number() }),
      },
    }),
  /** Render sample values through imaging at preview size; nothing is stored on an item. */
  preview: proc("personalization.read")
    .route({ method: "POST", path: "/{id}/preview" })
    .input(z.object({ id: Id, values: z.record(z.string(), z.string()) }))
    .output(RenderPreview),
});

const artwork = base.prefix("/artwork").router({
  /** Personalized items and their render status; default filter is flagged first, by ship-by. */
  list: proc("personalization.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(ITEM_ARTWORK_STATUSES)).optional(),
        shipByTo: Timestamp.optional(),
        designId: Id.optional(),
        search: z.string().optional(),
      }),
    )
    .output(
      paginated(ItemArtwork).extend({
        counts: z.record(z.enum(ITEM_ARTWORK_STATUSES), z.number().int().nonnegative()),
      }),
    ),
  get: proc("personalization.read", { auth: "floor" })
    .route({ method: "GET", path: "/{orderItemId}" })
    .input(z.object({ orderItemId: Id }))
    .output(ItemArtwork),
  /** Approve as rendered (clears flags); the item moves needs_artwork -> ready. */
  approve: proc("artwork.approve")
    .route({ method: "POST", path: "/{orderItemId}/approve" })
    .input(z.object({ orderItemId: Id }))
    .output(ItemArtwork),
  /** Edit slot values and re-render synchronously; new flags may appear. */
  update: proc("personalization.manage")
    .route({ method: "PUT", path: "/{orderItemId}/values" })
    .input(
      z.object({
        orderItemId: Id,
        values: z.record(z.string(), z.string()),
        approve: z.boolean().default(false),
      }),
    )
    .output(ItemArtwork),
  /** Re-render with the current values (e.g. after a template change). */
  rerender: proc("personalization.manage")
    .route({ method: "POST", path: "/{orderItemId}/rerender" })
    .input(z.object({ orderItemId: Id }))
    .output(ItemArtwork),
});

export const personalization = base
  .prefix("/personalization")
  .tag("personalization")
  .router({ templates, artwork });
