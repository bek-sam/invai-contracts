import { z } from "zod";
import { Id } from "./common";

export const StockLevel = z.object({
  blankVariantId: Id,
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  reorderPoint: z.number().int().nullable(),
});
