import { z } from "zod";
import { Id } from "./schemas/common";

/** Outbox events: written in the same DB transaction as the change, relayed to BullMQ. */
export const Events = {
  "order.imported": z.object({ orderId: Id }),
  "order.cancelled": z.object({ orderId: Id }),
  "item.ready": z.object({ orderItemId: Id }),
  "artwork.flagged": z.object({ orderItemId: Id, reason: z.string() }),
  "sheet.built": z.object({ gangSheetId: Id }),
  "item.pressed": z.object({ orderItemId: Id }),
  "shipment.labeled": z.object({ shipmentId: Id }),
  "stock.low": z.object({ blankVariantId: Id }),
} as const;

export type EventName = keyof typeof Events;
export type EventPayload<E extends EventName> = z.infer<(typeof Events)[E]>;
