import { z } from "zod";
import { Cents, Id } from "./common";

export const Shipment = z.object({
  id: Id,
  orderId: Id,
  carrier: z.enum(["usps", "ups"]),
  service: z.string(),
  trackingCode: z.string().nullable(),
  labelKey: z.string().nullable(),
  postage: Cents,
  status: z.enum(["pending", "labeled", "in_transit", "delivered", "returned"]),
});
