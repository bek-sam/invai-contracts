import { z } from "zod";
import { PO_STATES } from "../states";
import { Supplier } from "./catalog";
import { Cents, Id, Timestamp } from "./common";

const Qty = z.number().int();

export const BlankSummary = z.object({
  variantId: Id,
  brand: z.string(),
  style: z.string(),
  styleCode: z.string(),
  color: z.string(),
  colorCode: z.string(),
  size: z.string(),
  supplier: Supplier,
  supplierSku: z.string(),
  cost: Cents,
});

/** Derived from the movement ledger (architecture.md 3.3), cached per variant and location. */
export const StockLevel = z.object({
  blankVariantId: Id,
  blank: BlankSummary,
  locationId: Id,
  onHand: Qty,
  reserved: Qty,
  available: Qty, // onHand - reserved
  incoming: Qty, // open PO lines
  reorderPoint: Qty.nullable(),
  reorderQty: Qty.nullable(),
  /** Units consumed per day over the velocity window. */
  dailyVelocity: z.number().nonnegative(),
  /** available / dailyVelocity; null when velocity is 0. */
  daysOfCover: z.number().nonnegative().nullable(),
  belowReorderPoint: z.boolean(),
  updatedAt: Timestamp,
});
export type StockLevel = z.infer<typeof StockLevel>;

export const MOVEMENT_KINDS = [
  "receive",
  "reserve",
  "release",
  "consume",
  "adjust",
  "return",
  "scrap",
  "count",
  "transfer",
] as const;

export const ADJUST_REASONS = [
  "damaged",
  "lost",
  "found",
  "correction",
  "sample",
  "other",
] as const;

export const Movement = z.object({
  id: Id,
  at: Timestamp,
  blankVariantId: Id,
  blank: BlankSummary,
  locationId: Id,
  kind: z.enum(MOVEMENT_KINDS),
  /** Signed: +receive/+return/+found, -consume/-scrap/-lost. Reserve/release don't change onHand. */
  qty: Qty,
  reason: z.enum(ADJUST_REASONS).nullable(),
  note: z.string().nullable(),
  ref: z
    .object({
      type: z.enum(["order_item", "purchase_order", "count", "reprint", "transfer"]),
      id: Id,
    })
    .nullable(),
  actor: z.object({ userId: Id.nullable(), name: z.string() }),
});
export type Movement = z.infer<typeof Movement>;

export const AdjustInput = z.object({
  blankVariantId: Id,
  locationId: Id.optional(), // default location
  qty: Qty.refine((n) => n !== 0, "qty must be non-zero"),
  reason: z.enum(ADJUST_REASONS),
  note: z.string().nullable().default(null),
});

export const CountInput = z.object({
  locationId: Id.optional(),
  lines: z.array(z.object({ blankVariantId: Id, counted: Qty.nonnegative() })).min(1),
  note: z.string().nullable().default(null),
});

export const CountResult = z.object({
  countId: Id,
  movements: z.array(Movement),
  variance: z.array(z.object({ blankVariantId: Id, expected: Qty, counted: Qty, delta: Qty })),
});

export const ReorderLine = z.object({
  blankVariantId: Id,
  blank: BlankSummary,
  available: Qty,
  incoming: Qty,
  reorderPoint: Qty.nullable(),
  dailyVelocity: z.number().nonnegative(),
  daysOfCover: z.number().nonnegative().nullable(),
  suggestedQty: Qty.positive(),
  unitCost: Cents,
  lineCost: Cents,
  /** Live supplier stock when the supplier adapter is connected. */
  supplierStock: Qty.nullable(),
  reason: z.enum(["below_reorder_point", "low_cover", "top_up_to_free_freight"]),
});

/** One suggestion per supplier, padded toward the free-freight threshold. */
export const ReorderSuggestion = z.object({
  supplier: Supplier,
  supplierName: z.string(),
  freeFreightThreshold: Cents,
  subtotal: Cents,
  meetsThreshold: z.boolean(),
  shortfall: Cents,
  lines: z.array(ReorderLine),
});
export type ReorderSuggestion = z.infer<typeof ReorderSuggestion>;

export const PoLine = z.object({
  id: Id,
  blankVariantId: Id,
  blank: BlankSummary,
  qty: Qty.positive(),
  receivedQty: Qty.nonnegative(),
  unitCost: Cents,
});

export const PurchaseOrder = z.object({
  id: Id,
  poNo: z.string(),
  supplier: Supplier,
  status: z.enum(PO_STATES),
  locationId: Id,
  lines: z.array(PoLine),
  subtotal: Cents,
  freight: Cents,
  total: Cents,
  supplierOrderId: z.string().nullable(),
  expectedAt: Timestamp.nullable(),
  notes: z.string().nullable(),
  submittedAt: Timestamp.nullable(),
  receivedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type PurchaseOrder = z.infer<typeof PurchaseOrder>;

export const PurchaseOrderInput = z.object({
  supplier: Supplier,
  locationId: Id.optional(),
  lines: z
    .array(
      z.object({
        blankVariantId: Id,
        qty: Qty.positive(),
        unitCost: Cents.nonnegative().optional(),
      }),
    )
    .min(1),
  freight: Cents.nonnegative().default(0),
  expectedAt: Timestamp.nullable().default(null),
  notes: z.string().nullable().default(null),
});

export const ReceiveInput = z.object({
  purchaseOrderId: Id,
  locationId: Id.optional(),
  /** Partial receipts allowed; omitted lines receive nothing. */
  lines: z.array(z.object({ lineId: Id, qty: Qty.positive() })).min(1),
  note: z.string().nullable().default(null),
});

export const SupplierInfo = z.object({
  supplier: Supplier,
  name: z.string(),
  connected: z.boolean(),
  provider: z.enum(["live", "mock", "none"]),
  freeFreightThreshold: Cents,
  accountNumber: z.string().nullable(),
  hasApiKey: z.boolean(),
  variantCount: z.number().int().nonnegative(),
});

export const InventorySettings = z.object({
  suppliers: z.array(
    z.object({
      supplier: Supplier,
      freeFreightThreshold: Cents.nonnegative(),
      accountNumber: z.string().nullable(),
      apiKey: z.string().nullable(), // write-only: never returned, "" clears
    }),
  ),
  /** Days of history used for velocity. */
  velocityWindowDays: z.number().int().positive(),
  /** Reorder point = velocity × (lead days + safety days) when no manual point is set. */
  leadTimeDays: z.number().int().nonnegative(),
  safetyDays: z.number().int().nonnegative(),
  reserveOnImport: z.boolean(),
});
export type InventorySettings = z.infer<typeof InventorySettings>;
