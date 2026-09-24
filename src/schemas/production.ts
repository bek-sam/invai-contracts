import { z } from "zod";
import { Id, Timestamp } from "./common";

export const GangSheet = z.object({
  id: Id,
  vendorId: Id.nullable(),
  widthIn: z.literal(22),
  lengthIn: z.number().positive(),
  utilization: z.number().min(0).max(1),
  status: z.enum(["building", "ready", "sent", "printed", "delivered"]),
  previewKey: z.string().nullable(),
  createdAt: Timestamp,
});
export type GangSheet = z.infer<typeof GangSheet>;

/** A press-station scan: transfer QR + blank/tote label. */
export const ScanInput = z.object({
  clientScanId: Id, // generated on the tablet so offline replays are idempotent
  station: z.enum(["pick", "press", "qc", "pack"]),
  transferId: Id.optional(),
  code: z.string(),
  scannedAt: Timestamp,
});

export const ScanResult = z.object({
  ok: z.boolean(),
  reason: z.string().nullable(),
  orderItemId: Id.nullable(),
});
