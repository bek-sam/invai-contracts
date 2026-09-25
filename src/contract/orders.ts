import { z } from "zod";
import { Placement } from "../schemas/catalog";
import { SkuRuleInput } from "../schemas/channels";
import { Address, Id, Page, Period, paginated, SortDir, Timestamp } from "../schemas/common";
import {
  CANCEL_REASONS,
  ChannelPerformance,
  HOLD_REASONS,
  ITEM_FLAG_CODES,
  Order,
  OrderCounts,
  OrderItem,
  OrderWithItems,
  TimelineEntry,
} from "../schemas/orders";
import { CHANNELS, ORDER_STATUSES } from "../states";
import { base, ItemStateFilter, proc } from "./_base";

const OrderListFilters = Page.extend({
  status: z.array(z.enum(ORDER_STATUSES)).optional(),
  channel: z.array(z.enum(CHANNELS)).optional(),
  /** Orders with at least one item in any of these states (e.g. needs_mapping, needs_artwork). */
  itemState: ItemStateFilter,
  connectionId: Id.optional(),
  atRisk: z.boolean().optional(),
  overdue: z.boolean().optional(),
  hasPersonalization: z.boolean().optional(),
  isRush: z.boolean().optional(),
  /** Order no, buyer name, channel order id or SKU. */
  search: z.string().max(200).optional(),
  shipByFrom: Timestamp.optional(),
  shipByTo: Timestamp.optional(),
  placedFrom: Timestamp.optional(),
  placedTo: Timestamp.optional(),
  tag: z.string().optional(),
  sort: z.enum(["shipBy", "placedAt", "updatedAt"]).default("shipBy"),
  dir: SortDir.default("asc"),
});

export const orders = base
  .prefix("/orders")
  .tag("orders")
  .router({
    /** The Order Hub queue, sorted by real ship-by by default. */
    list: proc("orders.read")
      .route({ method: "GET", path: "/" })
      .input(OrderListFilters)
      .output(paginated(Order)),
    get: proc("orders.read", { auth: "floor" })
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(OrderWithItems),
    timeline: proc("orders.read")
      .route({ method: "GET", path: "/{id}/timeline" })
      .input(Page.extend({ id: Id }))
      .output(paginated(TimelineEntry)),
    hold: proc("orders.manage")
      .route({ method: "POST", path: "/{id}/hold" })
      .input(
        z.object({
          id: Id,
          reason: z.enum(HOLD_REASONS),
          note: z.string().nullable().default(null),
        }),
      )
      .output(OrderWithItems),
    release: proc("orders.manage")
      .route({ method: "POST", path: "/{id}/release" })
      .input(z.object({ id: Id }))
      .output(OrderWithItems),
    /** Cancels every open item; transfers already nested are marked scrap and blanks return to stock. */
    cancel: proc("orders.manage")
      .route({ method: "POST", path: "/{id}/cancel" })
      .input(
        z.object({
          id: Id,
          reason: z.enum(CANCEL_REASONS),
          note: z.string().nullable().default(null),
          /** Cancel only these items (partial cancel). */
          orderItemIds: z.array(Id).optional(),
        }),
      )
      .output(OrderWithItems),
    addNote: proc("orders.read")
      .route({ method: "POST", path: "/{id}/notes" })
      .input(z.object({ id: Id, text: z.string().min(1).max(2000) }))
      .output(TimelineEntry),
    setTags: proc("orders.manage")
      .route({ method: "PUT", path: "/{id}/tags" })
      .input(z.object({ id: Id, tags: z.array(z.string().min(1).max(40)) }))
      .output(Order),
    /**
     * Format-only address fix (no carrier call — the only carrier-verified check,
     * `shipping.rates`, needs a packed order). Refused once any shipment for the order has a
     * live label. Releases the `address_check` hold when the write succeeds.
     */
    updateAddress: proc("orders.manage")
      .route({ method: "PATCH", path: "/{id}/address" })
      .input(z.object({ id: Id, address: Address }))
      .output(OrderWithItems)
      .errors({
        ADDRESS_LOCKED: {
          status: 409,
          message: "This order already has a shipping label; void it first",
        },
        ADDRESS_INVALID: {
          status: 422,
          message: "Ship-to address is not deliverable",
          data: z.object({ detail: z.string() }),
        },
      }),
    /** Counts for the Order Hub sidebar. Same filters as list, minus paging and sorting. */
    counts: proc("orders.read")
      .route({ method: "GET", path: "/counts" })
      .input(
        OrderListFilters.omit({ cursor: true, limit: true, sort: true, dir: true, status: true }),
      )
      .output(OrderCounts),
    channelPerformance: proc("orders.read")
      .route({ method: "GET", path: "/channel-performance" })
      .input(z.object({ period: Period }))
      .output(z.object({ period: Period, items: z.array(ChannelPerformance) })),
  });

export const orderItems = base
  .prefix("/order-items")
  .tag("orders")
  .router({
    /** Items across orders, e.g. everything needs_mapping or flagged. */
    list: proc("orders.read")
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          state: ItemStateFilter,
          flag: z.enum(ITEM_FLAG_CODES).optional(),
          designId: Id.optional(),
          blankVariantId: Id.optional(),
          sheetId: Id.optional(),
          shipByTo: Timestamp.optional(),
          search: z.string().max(200).optional(),
        }),
      )
      .output(paginated(OrderItem)),
    get: proc("orders.read", { auth: "floor" })
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(OrderItem),
    /**
     * The one-time manual map: item -> product (or design + blank variant). `saveRule` learns
     * a SKU rule so the next order maps itself. Applies to every sibling unit of the same
     * channel line and to other open items with the same channel SKU when `applyToSameSku`.
     */
    map: proc("orders.map")
      .route({ method: "POST", path: "/{id}/map" })
      .input(
        z.object({
          id: Id,
          designId: Id,
          blankVariantId: Id,
          placement: Placement.optional(), // default: design's first placement
          applyToSameSku: z.boolean().default(true),
          saveRule: SkuRuleInput.optional(),
        }),
      )
      .output(
        z.object({
          item: OrderItem,
          itemsMapped: z.number().int().nonnegative(),
          ruleId: Id.nullable(),
        }),
      ),
    /** Override the artwork for this unit with an uploaded file (skips the personalization render). */
    setArtwork: proc("orders.map")
      .route({ method: "POST", path: "/{id}/artwork" })
      .input(
        z.object({
          id: Id,
          fileKey: z.string().min(1),
          widthIn: z.number().positive().optional(),
          heightIn: z.number().positive().optional(),
        }),
      )
      .output(OrderItem),
    setFlag: proc("orders.map")
      .route({ method: "POST", path: "/{id}/flags" })
      .input(
        z.object({
          id: Id,
          code: z.enum(ITEM_FLAG_CODES),
          active: z.boolean(),
          note: z.string().nullable().default(null),
        }),
      )
      .output(OrderItem),
    setRush: proc("orders.manage")
      .route({ method: "POST", path: "/{id}/rush" })
      .input(z.object({ id: Id, isRush: z.boolean() }))
      .output(OrderItem),
  });
