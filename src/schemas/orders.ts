import { z } from "zod";
import { CHANNELS, ORDER_ITEM_STATES } from "../states";
import { Cents, Id, Timestamp } from "./common";

export const PersonalizationAnswer = z.object({
  question: z.string(),
  answer: z.string().nullable(),
  fileUrl: z.url().nullable(),
});

export const OrderItem = z.object({
  id: Id,
  channelSku: z.string(),
  designId: Id.nullable(),
  blankVariantId: Id.nullable(),
  quantity: z.number().int().positive(),
  price: Cents,
  personalization: z.array(PersonalizationAnswer),
  state: z.enum(ORDER_ITEM_STATES),
});
export type OrderItem = z.infer<typeof OrderItem>;

/** What every channel adapter produces. The core never sees channel-specific payloads. */
export const NormalizedOrder = z.object({
  id: Id,
  channel: z.enum(CHANNELS),
  channelOrderId: z.string(),
  placedAt: Timestamp,
  shipBy: Timestamp,
  items: z.array(OrderItem),
});
export type NormalizedOrder = z.infer<typeof NormalizedOrder>;
