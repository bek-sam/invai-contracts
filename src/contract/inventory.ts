import { z } from "zod";
import { SUPPLIERS } from "../schemas/catalog";
import { Id, Page, paginated, Timestamp } from "../schemas/common";
import {
  AdjustInput,
  CountInput,
  CountResult,
  InventorySettings,
  MOVEMENT_KINDS,
  Movement,
  PurchaseOrder,
  PurchaseOrderInput,
  ReceiveInput,
  ReorderSuggestion,
  StockLevel,
  SupplierInfo,
} from "../schemas/inventory";
import { PO_STATES } from "../states";
import { base, proc } from "./_base";

const stock = base.prefix("/stock").router({
  list: proc("inventory.read", { auth: "floor" })
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        locationId: Id.optional(),
        search: z.string().optional(),
        brand: z.string().optional(),
        styleCode: z.string().optional(),
        colorCode: z.string().optional(),
        supplier: z.enum(SUPPLIERS).optional(),
        belowReorderPoint: z.boolean().optional(),
        sort: z.enum(["style", "available", "daysOfCover"]).default("style"),
      }),
    )
    .output(paginated(StockLevel).extend({ lowStockCount: z.number().int().nonnegative() })),
  get: proc("inventory.read", { auth: "floor" })
    .route({ method: "GET", path: "/{blankVariantId}" })
    .input(z.object({ blankVariantId: Id, locationId: Id.optional() }))
    .output(StockLevel),
  setReorderPoint: proc("inventory.adjust")
    .route({ method: "PUT", path: "/{blankVariantId}/reorder-point" })
    .input(
      z.object({
        blankVariantId: Id,
        locationId: Id.optional(),
        reorderPoint: z.number().int().nonnegative().nullable(),
        reorderQty: z.number().int().positive().nullable(),
      }),
    )
    .output(StockLevel),
});

const movements = base.prefix("/movements").router({
  list: proc("inventory.read")
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        blankVariantId: Id.optional(),
        locationId: Id.optional(),
        kind: z.array(z.enum(MOVEMENT_KINDS)).optional(),
        from: Timestamp.optional(),
        to: Timestamp.optional(),
      }),
    )
    .output(paginated(Movement)),
});

const purchaseOrders = base.prefix("/purchase-orders").router({
  list: proc("purchasing.read", { auth: "floor" })
    .route({ method: "GET", path: "/" })
    .input(
      Page.extend({
        status: z.array(z.enum(PO_STATES)).optional(),
        supplier: z.enum(SUPPLIERS).optional(),
      }),
    )
    .output(paginated(PurchaseOrder)),
  get: proc("purchasing.read", { auth: "floor" })
    .route({ method: "GET", path: "/{id}" })
    .input(z.object({ id: Id }))
    .output(PurchaseOrder),
  create: proc("purchasing.manage")
    .route({ method: "POST", path: "/" })
    .input(PurchaseOrderInput)
    .output(PurchaseOrder),
  /** Draft only. */
  update: proc("purchasing.manage")
    .route({ method: "PATCH", path: "/{id}" })
    .input(PurchaseOrderInput.partial().extend({ id: Id }))
    .output(PurchaseOrder),
  /** Sends to the supplier adapter (S&S REST, or mock) and marks lines incoming. */
  submit: proc("purchasing.manage")
    .route({ method: "POST", path: "/{id}/submit" })
    .input(z.object({ id: Id }))
    .output(PurchaseOrder)
    .errors({
      SUPPLIER_REJECTED: {
        status: 502,
        message: "Supplier rejected the order",
        data: z.object({ detail: z.string() }),
      },
    }),
  /** Receive lines (partial allowed); writes `receive` movements and updates incoming. */
  receive: proc("purchasing.receive", { auth: "floor" })
    .route({ method: "POST", path: "/{purchaseOrderId}/receive" })
    .input(ReceiveInput)
    .output(PurchaseOrder),
  cancel: proc("purchasing.manage")
    .route({ method: "POST", path: "/{id}/cancel" })
    .input(z.object({ id: Id }))
    .output(PurchaseOrder),
  /**
   * For suppliers with no ordering API (B-86): records that the order was placed by hand.
   * Valid only from `draft`. Pure state transition, no outbound call, so it's naturally
   * idempotent: the same ref on an already-`submitted` PO is a no-op; a different ref on a
   * non-draft PO is `INVALID_TRANSITION`.
   */
  markPlaced: proc("purchasing.manage")
    .route({ method: "POST", path: "/{id}/mark-placed" })
    .input(z.object({ id: Id, supplierOrderRef: z.string().min(1).max(120) }))
    .output(PurchaseOrder)
    .errors({
      INVALID_TRANSITION: { status: 409, message: "Only a draft PO can be marked placed" },
    }),
});

const suppliers = base.prefix("/suppliers").router({
  list: proc("purchasing.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(z.object({ items: z.array(SupplierInfo) })),
  /** Live stock from the supplier adapter for these variants (mock returns seeded numbers). */
  stock: proc("purchasing.read")
    .route({ method: "POST", path: "/stock" })
    .input(z.object({ blankVariantIds: z.array(Id).min(1).max(200) }))
    .output(
      z.object({
        items: z.array(
          z.object({
            blankVariantId: Id,
            supplierStock: z.number().int().nonnegative().nullable(),
            checkedAt: Timestamp,
          }),
        ),
      }),
    ),
});

const settings = base.prefix("/settings").router({
  get: proc("inventory.read")
    .route({ method: "GET", path: "/" })
    .input(z.object({}))
    .output(InventorySettings),
  update: proc("purchasing.manage")
    .route({ method: "PATCH", path: "/" })
    .input(InventorySettings.partial())
    .output(InventorySettings),
});

export const inventory = base
  .prefix("/inventory")
  .tag("inventory")
  .router({
    stock,
    movements,
    purchaseOrders,
    suppliers,
    settings,
    /** Manual +/- with a reason; writes one `adjust` movement. */
    adjust: proc("inventory.adjust", { auth: "floor" })
      .route({ method: "POST", path: "/adjust" })
      .input(AdjustInput)
      .output(Movement),
    /** Physical count: each line becomes a `count` movement for the variance. */
    count: proc("inventory.count", { auth: "floor" })
      .route({ method: "POST", path: "/count" })
      .input(CountInput)
      .output(CountResult),
    /** Velocity-based reorder suggestions grouped per supplier, padded to the free-freight line. */
    reorderSuggestions: proc("purchasing.read")
      .route({ method: "GET", path: "/reorder-suggestions" })
      .input(
        z.object({
          locationId: Id.optional(),
          supplier: z.enum(SUPPLIERS).optional(),
          coverDays: z.number().int().positive().optional(),
        }),
      )
      .output(z.object({ items: z.array(ReorderSuggestion), generatedAt: Timestamp })),
    /** Turn a suggestion into a draft PO in one click. */
    createPoFromSuggestion: proc("purchasing.manage")
      .route({ method: "POST", path: "/reorder-suggestions/create-po" })
      .input(
        z.object({
          supplier: z.enum(SUPPLIERS),
          locationId: Id.optional(),
          lines: z.array(z.object({ blankVariantId: Id, qty: z.number().int().positive() })).min(1),
        }),
      )
      .output(PurchaseOrder),
    /** Renders a merged PDF of QR labels for blanks (bin/shelf labelling); returns its S3 key. */
    blankLabels: proc("purchasing.manage")
      .route({ method: "POST", path: "/blanks/labels" })
      .input(z.object({ variantIds: z.array(Id).min(1).max(200) }))
      .output(z.object({ key: z.string() })),
  });
