import { z } from "zod";
import { Cents, Id } from "./common";

export const Placement = z.enum(["front", "back", "left_chest", "sleeve_left", "sleeve_right"]);

export const Design = z.object({
  id: Id,
  name: z.string(),
  placements: z.array(
    z.object({
      placement: Placement,
      fileKey: z.string(),
      widthIn: z.number().positive(),
      heightIn: z.number().positive(),
    }),
  ),
  personalizationTemplateKey: z.string().nullable(),
});
export type Design = z.infer<typeof Design>;

export const BlankVariant = z.object({
  id: Id,
  brand: z.string(),
  style: z.string(),
  color: z.string(),
  size: z.string(),
  supplier: z.enum(["ssactivewear", "sanmar", "other"]),
  supplierSku: z.string(),
  cost: Cents,
  weightOz: z.number().positive(),
});
export type BlankVariant = z.infer<typeof BlankVariant>;
