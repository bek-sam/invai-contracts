import { z } from "zod";
import { CHANNELS, type Channel } from "./states";

/**
 * Per-channel rules as data. Listing limits feed the AI listing validators; fee and
 * ship-by defaults seed a shop's cost settings and channel settings. Everything here is
 * a DEFAULT the shop can edit (fees in finance.costSettings.update, ship-by in
 * channels.update); the backend must read the shop's saved values, not this table.
 */

export const ChannelListingRules = z.object({
  titleMax: z.number().int().positive(),
  descriptionMax: z.number().int().positive(),
  tagsMax: z.number().int().nonnegative(),
  tagMaxLen: z.number().int().nonnegative(),
  bulletsMax: z.number().int().nonnegative(),
  bulletMaxLen: z.number().int().nonnegative(),
  /** Channel requires an AI-content / production-partner disclosure on the listing. */
  requiresAiDisclosure: z.boolean(),
});
export type ChannelListingRules = z.infer<typeof ChannelListingRules>;

export const ChannelFeeDefaults = z.object({
  /** Marketplace transaction / referral fee, percent of item price + shipping. */
  transactionPct: z.number().min(0).max(100),
  /** Fixed fee per order (cents). */
  perOrderCents: z.number().int().nonnegative(),
  /** Payment processing percent. */
  paymentPct: z.number().min(0).max(100),
  /** Payment processing fixed fee per order (cents). */
  paymentFixedCents: z.number().int().nonnegative(),
  /** Listing / insertion fee per sold unit (cents). Etsy renews the $0.20 listing on each sale. */
  listingFeeCents: z.number().int().nonnegative(),
  note: z.string(),
});
export type ChannelFeeDefaults = z.infer<typeof ChannelFeeDefaults>;

export const ChannelShipByRules = z.object({
  /** How the ship-by date is computed when the channel does not send one. */
  source: z.enum(["channel_provided", "processing_days", "handling_days"]),
  /** Business days from order placement to ship-by when computed locally. */
  defaultDays: z.number().int().nonnegative(),
  /** Share of orders that must ship on time to keep the channel's seller standing. */
  onTimeTarget: z.number().min(0).max(1).nullable(),
  /** Share of orders that must carry valid tracking. */
  validTrackingTarget: z.number().min(0).max(1).nullable(),
  note: z.string(),
});
export type ChannelShipByRules = z.infer<typeof ChannelShipByRules>;

export const ChannelRules = z.object({
  channel: z.enum(CHANNELS),
  label: z.string(),
  /** How orders arrive in v1. `api` = adapter + webhooks/polling; `csv` = export upload only. */
  orderIntake: z.enum(["api", "csv", "api_pending_approval"]),
  listing: ChannelListingRules,
  fees: ChannelFeeDefaults,
  shipBy: ChannelShipByRules,
});
export type ChannelRules = z.infer<typeof ChannelRules>;

export const CHANNEL_RULES: Record<Channel, ChannelRules> = {
  etsy: {
    channel: "etsy",
    label: "Etsy",
    orderIntake: "api_pending_approval",
    listing: {
      titleMax: 140,
      descriptionMax: 102_400,
      tagsMax: 13,
      tagMaxLen: 20,
      bulletsMax: 0,
      bulletMaxLen: 0,
      requiresAiDisclosure: true,
    },
    fees: {
      transactionPct: 6.5,
      perOrderCents: 0,
      paymentPct: 3,
      paymentFixedCents: 25,
      listingFeeCents: 20,
      note: "6.5% transaction + $0.20 listing renewal + Etsy Payments 3% + $0.25 (US)",
    },
    shipBy: {
      source: "channel_provided",
      defaultDays: 3,
      onTimeTarget: 0.95,
      validTrackingTarget: 0.95,
      note: "Etsy sends the processing-time ship-by; Star Seller needs 95% on time with tracking",
    },
  },
  amazon: {
    channel: "amazon",
    label: "Amazon",
    orderIntake: "csv",
    listing: {
      titleMax: 200,
      descriptionMax: 2000,
      tagsMax: 0,
      tagMaxLen: 0,
      bulletsMax: 5,
      bulletMaxLen: 500,
      requiresAiDisclosure: false,
    },
    fees: {
      transactionPct: 17,
      perOrderCents: 0,
      paymentPct: 0,
      paymentFixedCents: 0,
      listingFeeCents: 0,
      note: "17% referral fee for clothing (Professional plan; monthly fee not included)",
    },
    shipBy: {
      source: "channel_provided",
      defaultDays: 1,
      onTimeTarget: 0.96,
      validTrackingTarget: 0.95,
      note: "Late shipment rate must stay under 4%; valid tracking rate 95%",
    },
  },
  shopify: {
    channel: "shopify",
    label: "Shopify",
    orderIntake: "api",
    listing: {
      titleMax: 255,
      descriptionMax: 65_535,
      tagsMax: 250,
      tagMaxLen: 255,
      bulletsMax: 0,
      bulletMaxLen: 0,
      requiresAiDisclosure: false,
    },
    fees: {
      transactionPct: 0,
      perOrderCents: 0,
      paymentPct: 2.9,
      paymentFixedCents: 30,
      listingFeeCents: 0,
      note: "Shopify Payments 2.9% + $0.30 (Basic plan, online); no marketplace referral fee",
    },
    shipBy: {
      source: "processing_days",
      defaultDays: 2,
      onTimeTarget: null,
      validTrackingTarget: null,
      note: "No marketplace deadline; ship-by = placed + shop processing days",
    },
  },
  tiktok: {
    channel: "tiktok",
    label: "TikTok Shop",
    orderIntake: "csv",
    listing: {
      titleMax: 255,
      descriptionMax: 10_000,
      tagsMax: 0,
      tagMaxLen: 0,
      bulletsMax: 0,
      bulletMaxLen: 0,
      requiresAiDisclosure: false,
    },
    fees: {
      // B-164: 6% referral for every menswear, womenswear and kids' fashion subcategory; the
      // referral fee covers every TikTok Shop fee except shipping and tax. Source: TikTok Shop US
      // Seller University, "Referral fees", knowledge_id=5988482086864682
      // (https://seller-us.tiktok.com/university/essay?knowledge_id=5988482086864682), page
      // updated 2026-05-14, fetched 2026-09-28 (T-22-1; first verified in T-7-2, 2026-09-25).
      // The earlier 8 was "referral ~6% + 2% transaction"; the 2% no longer applies.
      transactionPct: 6,
      perOrderCents: 0,
      paymentPct: 0,
      paymentFixedCents: 0,
      listingFeeCents: 0,
      note: "6% referral on apparel (US, page updated 2026-05-14), covers all TikTok Shop fees but shipping and tax",
    },
    shipBy: {
      source: "handling_days",
      defaultDays: 3,
      onTimeTarget: 0.96,
      validTrackingTarget: 0.95,
      note: "Dispatch within 3 business days; late dispatch capped at about 4%",
    },
  },
  walmart: {
    channel: "walmart",
    label: "Walmart",
    orderIntake: "csv",
    listing: {
      titleMax: 200,
      descriptionMax: 4000,
      tagsMax: 0,
      tagMaxLen: 0,
      bulletsMax: 10,
      bulletMaxLen: 500,
      requiresAiDisclosure: false,
    },
    fees: {
      transactionPct: 15,
      perOrderCents: 0,
      paymentPct: 0,
      paymentFixedCents: 0,
      listingFeeCents: 0,
      note: "15% referral fee for apparel",
    },
    shipBy: {
      source: "channel_provided",
      defaultDays: 1,
      onTimeTarget: 0.99,
      validTrackingTarget: 0.99,
      note: "99% on-time shipping and 99% valid tracking required",
    },
  },
  ebay: {
    channel: "ebay",
    label: "eBay",
    orderIntake: "csv",
    listing: {
      titleMax: 80,
      descriptionMax: 500_000,
      tagsMax: 0,
      tagMaxLen: 0,
      bulletsMax: 0,
      bulletMaxLen: 0,
      requiresAiDisclosure: false,
    },
    fees: {
      transactionPct: 13.6,
      perOrderCents: 40,
      paymentPct: 0,
      paymentFixedCents: 0,
      listingFeeCents: 0,
      note: "13.6% final value fee + $0.40 per order (clothing). Not a v1 channel.",
    },
    shipBy: {
      source: "handling_days",
      defaultDays: 1,
      onTimeTarget: null,
      validTrackingTarget: null,
      note: "Not a v1 channel",
    },
  },
  csv: {
    channel: "csv",
    label: "Generic CSV",
    orderIntake: "csv",
    listing: {
      titleMax: 255,
      descriptionMax: 10_000,
      tagsMax: 0,
      tagMaxLen: 0,
      bulletsMax: 0,
      bulletMaxLen: 0,
      requiresAiDisclosure: false,
    },
    fees: {
      transactionPct: 0,
      perOrderCents: 0,
      paymentPct: 0,
      paymentFixedCents: 0,
      listingFeeCents: 0,
      note: "No fees assumed for a generic CSV source",
    },
    shipBy: {
      source: "processing_days",
      defaultDays: 2,
      onTimeTarget: null,
      validTrackingTarget: null,
      note: "Ship-by from the CSV column when present, else placed + processing days",
    },
  },
};

/** Channels a shop can connect in v1 (eBay and generic CSV are not offered in the UI). */
export const CONNECTABLE_CHANNELS = ["shopify", "etsy", "amazon", "tiktok", "walmart"] as const;

/** CSV export formats the importer understands. */
export const CSV_FORMATS = ["etsy", "amazon", "tiktok", "walmart", "shopify", "generic"] as const;
