import { z } from "zod";
import { CHANNELS, SHIPMENT_STATES } from "../states";
import { Address, Cents, Id, Timestamp } from "./common";

/** `mock` is the sandbox carrier used when no EasyPost key is present. */
export const CARRIERS = ["usps", "ups", "mock"] as const;
export const Carrier = z.enum(CARRIERS);

export const Parcel = z.object({
  lengthIn: z.number().positive(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  weightOz: z.number().positive(),
});

export const TRACKING_PUSH_STATUSES = ["not_required", "pending", "pushed", "failed"] as const;

export const Shipment = z.object({
  id: Id,
  orderId: Id,
  orderNo: z.string(),
  channel: z.enum(CHANNELS),
  status: z.enum(SHIPMENT_STATES),
  orderItemIds: z.array(Id),
  carrier: Carrier.nullable(),
  service: z.string().nullable(),
  trackingCode: z.string().nullable(),
  trackingUrl: z.url().nullable(),
  labelKey: z.string().nullable(),
  labelFormat: z.enum(["pdf", "zpl"]).nullable(),
  postage: Cents,
  /** Platform per-label fee (billing). */
  labelFee: Cents,
  parcel: Parcel,
  packagePresetId: Id.nullable(),
  shipTo: Address.nullable(),
  shipBy: Timestamp,
  trackingPush: z.object({
    status: z.enum(TRACKING_PUSH_STATUSES),
    pushedAt: Timestamp.nullable(),
    attempts: z.number().int().nonnegative(),
    error: z.string().nullable(),
  }),
  labeledAt: Timestamp.nullable(),
  deliveredAt: Timestamp.nullable(),
  voidedAt: Timestamp.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Shipment = z.infer<typeof Shipment>;

/** An order whose units are all packed and that has no label yet. */
export const ShipQueueEntry = z.object({
  orderId: Id,
  orderNo: z.string(),
  channel: z.enum(CHANNELS),
  shipBy: Timestamp,
  isRush: z.boolean(),
  atRisk: z.boolean(),
  unitCount: z.number().int().positive(),
  /** From blank weights + package preset tare. */
  estimatedWeightOz: z.number().positive(),
  suggestedPresetId: Id.nullable(),
  binCode: z.string().nullable(),
  packedAt: Timestamp,
  shippingMethod: z.string().nullable(),
  addressValid: z.boolean(),
});
export type ShipQueueEntry = z.infer<typeof ShipQueueEntry>;

export const Rate = z.object({
  rateId: z.string(),
  carrier: Carrier,
  service: z.string(),
  serviceLabel: z.string(),
  rate: Cents,
  deliveryDays: z.number().int().positive().nullable(),
  estimatedDeliveryAt: Timestamp.nullable(),
  /** Cheapest / fastest markers for the UI. */
  cheapest: z.boolean(),
  fastest: z.boolean(),
});
export type Rate = z.infer<typeof Rate>;

export const RatesInput = z.object({
  orderId: Id,
  /** Overrides; otherwise computed from the order's blanks and the suggested preset. */
  parcel: Parcel.partial().optional(),
  packagePresetId: Id.optional(),
});

export const RatesResult = z.object({
  shipmentId: Id,
  parcel: Parcel,
  rates: z.array(Rate),
  ratedAt: Timestamp,
});

export const BATCH_STRATEGIES = ["cheapest", "fastest", "cheapest_on_time"] as const;

export const BatchBuyResult = z.object({
  jobId: Id,
  results: z.array(
    z.object({
      orderId: Id,
      shipmentId: Id.nullable(),
      status: z.enum(["labeled", "failed", "skipped"]),
      error: z.string().nullable(),
    }),
  ),
  labeled: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  totalPostage: Cents,
});

export const PackagePreset = z.object({
  id: Id,
  name: z.string(),
  lengthIn: z.number().positive(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  tareOz: z.number().nonnegative(),
  /** Use for orders with this many units or fewer. */
  maxUnits: z.number().int().positive().nullable(),
  isDefault: z.boolean(),
});

export const ShippingSettings = z.object({
  fromAddress: Address.nullable(),
  packagePresets: z.array(PackagePreset),
  /** Overrides the blank variant weight for a whole style, e.g. hoodies. */
  weightPerStyle: z.array(z.object({ styleCode: z.string(), weightOz: z.number().positive() })),
  defaultStrategy: z.enum(BATCH_STRATEGIES),
  allowedCarriers: z.array(Carrier),
  labelFormat: z.enum(["pdf", "zpl"]),
  trackingPushEnabled: z.boolean(),
  carrierProvider: z.enum(["easypost", "mock"]),
});
export type ShippingSettings = z.infer<typeof ShippingSettings>;

export const ShippingSettingsInput = z.object({
  fromAddress: Address.nullable().optional(),
  packagePresets: z
    .array(PackagePreset.omit({ id: true }).extend({ id: Id.optional() }))
    .optional(),
  weightPerStyle: z
    .array(z.object({ styleCode: z.string(), weightOz: z.number().positive() }))
    .optional(),
  defaultStrategy: z.enum(BATCH_STRATEGIES).optional(),
  allowedCarriers: z.array(Carrier).optional(),
  labelFormat: z.enum(["pdf", "zpl"]).optional(),
  trackingPushEnabled: z.boolean().optional(),
});

export const TrackingPushStatus = z.object({
  shipmentId: Id,
  orderId: Id,
  orderNo: z.string(),
  channel: z.enum(CHANNELS),
  trackingCode: z.string(),
  status: z.enum(TRACKING_PUSH_STATUSES),
  attempts: z.number().int().nonnegative(),
  lastAttemptAt: Timestamp.nullable(),
  error: z.string().nullable(),
});
