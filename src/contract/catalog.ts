import { z } from "zod";
import {
  BlankImportReport,
  BlankVariant,
  BlankVariantInput,
  Design,
  DesignInput,
  Product,
  ProductInput,
  QA_STATUSES,
  SUPPLIERS,
} from "../schemas/catalog";
import { Id, Page, paginated } from "../schemas/common";
import { base, proc } from "./_base";

export const designs = base
  .prefix("/designs")
  .tag("catalog")
  .router({
    list: proc("catalog.read", { auth: "floor" })
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          search: z.string().optional(),
          tag: z.string().optional(),
          status: z.enum(["active", "archived"]).default("active"),
          qaStatus: z.enum(QA_STATUSES).optional(),
          personalized: z.boolean().optional(),
        }),
      )
      .output(paginated(Design)),
    get: proc("catalog.read", { auth: "floor" })
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(Design),
    /** Creating a design triggers imaging QA on every placement file. */
    create: proc("catalog.manage")
      .route({ method: "POST", path: "/" })
      .input(DesignInput)
      .output(Design),
    update: proc("catalog.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(DesignInput.partial().extend({ id: Id }))
      .output(Design),
    archive: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/archive" })
      .input(z.object({ id: Id }))
      .output(Design),
    unarchive: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/unarchive" })
      .input(z.object({ id: Id }))
      .output(Design),
    /** Re-run imaging QA (and alpha cleanup when `cleanAlpha`). */
    runQa: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/qa" })
      .input(z.object({ id: Id, cleanAlpha: z.boolean().default(false) }))
      .output(Design),
  });

export const blanks = base
  .prefix("/blanks")
  .tag("catalog")
  .router({
    list: proc("catalog.read", { auth: "floor" })
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          search: z.string().optional(),
          brand: z.string().optional(),
          styleCode: z.string().optional(),
          colorCode: z.string().optional(),
          sizeCode: z.string().optional(),
          supplier: z.enum(SUPPLIERS).optional(),
          status: z.enum(["active", "archived"]).default("active"),
        }),
      )
      .output(paginated(BlankVariant)),
    get: proc("catalog.read", { auth: "floor" })
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(BlankVariant),
    create: proc("catalog.manage")
      .route({ method: "POST", path: "/" })
      .input(BlankVariantInput)
      .output(BlankVariant),
    update: proc("catalog.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(BlankVariantInput.partial().extend({ id: Id }))
      .output(BlankVariant),
    archive: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/archive" })
      .input(z.object({ id: Id }))
      .output(BlankVariant),
    /**
     * Bulk upsert by (brand, styleCode, colorCode, sizeCode): inline rows (≤ 5,000) or a CSV
     * uploaded via files.presignUpload with the same columns as BlankVariantInput.
     */
    bulkImport: proc("catalog.manage")
      .route({ method: "POST", path: "/import" })
      .input(
        z
          .object({
            rows: z.array(BlankVariantInput).max(5000).optional(),
            fileKey: z.string().optional(),
          })
          .refine(
            (v) => v.rows !== undefined || v.fileKey !== undefined,
            "rows or fileKey is required",
          ),
      )
      .output(BlankImportReport),
    /** Distinct brand/style/color/size values for filters and the SKU mapper. */
    facets: proc("catalog.read")
      .route({ method: "GET", path: "/facets" })
      .input(z.object({}))
      .output(
        z.object({
          brands: z.array(z.string()),
          styles: z.array(
            z.object({
              brand: z.string(),
              styleCode: z.string(),
              style: z.string(),
              styleName: z.string().nullable(),
            }),
          ),
          colors: z.array(
            z.object({ colorCode: z.string(), color: z.string(), colorHex: z.string().nullable() }),
          ),
          sizes: z.array(z.string()),
        }),
      ),
  });

export const products = base
  .prefix("/products")
  .tag("catalog")
  .router({
    list: proc("catalog.read")
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          designId: Id.optional(),
          styleCode: z.string().optional(),
          search: z.string().optional(),
          status: z.enum(["active", "archived"]).default("active"),
        }),
      )
      .output(paginated(Product)),
    get: proc("catalog.read")
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(Product),
    create: proc("catalog.manage")
      .route({ method: "POST", path: "/" })
      .input(ProductInput)
      .output(Product),
    update: proc("catalog.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(ProductInput.partial().extend({ id: Id }))
      .output(Product),
    archive: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/archive" })
      .input(z.object({ id: Id }))
      .output(Product),
    /** Composite the design onto a blank color via imaging /mockup. */
    mockup: proc("catalog.manage")
      .route({ method: "POST", path: "/{id}/mockup" })
      .input(
        z.object({
          id: Id,
          colorCode: z.string(),
          placement: z.enum(["front", "back"]).default("front"),
        }),
      )
      .output(z.object({ fileKey: z.string(), url: z.url() })),
  });
