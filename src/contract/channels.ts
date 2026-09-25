import { z } from "zod";
import {
  ChannelConnection,
  ConnectInput,
  ConnectionHealth,
  ConnectionSettings,
  ConnectResult,
  CsvFormat,
  ImportReport,
  SKU_PATTERN_TYPES,
  SkuMatchResult,
  SkuRule,
  SkuRuleInput,
  SkuRuleTarget,
  SkuSuggestion,
  UnmappedSku,
} from "../schemas/channels";
import { Id, JobRef, Ok, Page, paginated } from "../schemas/common";
import { CHANNELS } from "../states";
import { base, proc } from "./_base";

export const channels = base
  .prefix("/channels")
  .tag("channels")
  .router({
    list: proc("channels.read")
      .route({ method: "GET", path: "/" })
      .input(z.object({}))
      .output(z.object({ items: z.array(ChannelConnection) })),
    get: proc("channels.read")
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(ChannelConnection),
    /** Shopify returns an OAuth URL to redirect to; CSV channels are created directly. */
    connect: proc("channels.manage")
      .route({ method: "POST", path: "/connect" })
      .input(ConnectInput)
      .output(ConnectResult)
      .errors({ ALREADY_CONNECTED: { status: 409, message: "This shop is already connected" } }),
    update: proc("channels.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(
        z.object({
          id: Id,
          name: z.string().min(1).optional(),
          settings: ConnectionSettings.partial().optional(),
        }),
      )
      .output(ChannelConnection),
    disconnect: proc("channels.manage")
      .route({ method: "POST", path: "/{id}/disconnect" })
      .input(z.object({ id: Id }))
      .output(ChannelConnection),
    /** Enqueues a fetch-orders job for an API connection. */
    syncNow: proc("channels.manage")
      .route({ method: "POST", path: "/{id}/sync" })
      .input(z.object({ id: Id }))
      .output(JobRef)
      .errors({ NOT_API_CONNECTION: { status: 400, message: "CSV connections cannot sync" } }),
    /**
     * Import a marketplace CSV export uploaded via files.presignUpload (kind "csv").
     * Files at or under the small inline threshold run to completion in the request (short
     * chunked sub-transactions) and return `status: "completed"|"failed"`, `jobId: null`.
     * Larger files enqueue a `csv_import` job and return at once with `status: "queued"`,
     * `jobId` set and zero counts; poll `channels.imports` or `production.jobs.get({ id: jobId })`.
     * Rows that fail are reported, the rest import. Re-importing the same order updates it
     * (idempotent on channel + channelOrderId).
     */
    importCsv: proc("channels.import")
      .route({ method: "POST", path: "/{id}/import" })
      .input(z.object({ id: Id, fileKey: z.string().min(1), format: CsvFormat }))
      .output(ImportReport)
      .errors({
        CSV_UNREADABLE: {
          status: 422,
          message: "The file is not a CSV in the chosen format",
          data: z.object({ detail: z.string() }),
        },
      }),
    imports: proc("channels.read")
      .route({ method: "GET", path: "/{id}/imports" })
      .input(Page.extend({ id: Id }))
      .output(paginated(ImportReport)),
    /** Health of every connection, for the sidebar and the sync_broken alert. */
    health: proc("channels.read")
      .route({ method: "GET", path: "/health" })
      .input(z.object({}))
      .output(
        z.object({
          items: z.array(
            z.object({
              connectionId: Id,
              channel: z.enum(CHANNELS),
              name: z.string(),
              health: ConnectionHealth,
            }),
          ),
        }),
      ),
  });

export const skuRules = base
  .prefix("/sku-rules")
  .tag("sku-mapper")
  .router({
    list: proc("sku_rules.read")
      .route({ method: "GET", path: "/" })
      .input(
        Page.extend({
          channel: z.enum(CHANNELS).optional(),
          patternType: z.enum(SKU_PATTERN_TYPES).optional(),
          search: z.string().optional(),
          active: z.boolean().optional(),
        }),
      )
      .output(paginated(SkuRule)),
    get: proc("sku_rules.read")
      .route({ method: "GET", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(SkuRule),
    create: proc("sku_rules.manage")
      .route({ method: "POST", path: "/" })
      .input(SkuRuleInput)
      .output(SkuRule),
    update: proc("sku_rules.manage")
      .route({ method: "PATCH", path: "/{id}" })
      .input(SkuRuleInput.partial().extend({ id: Id }))
      .output(SkuRule),
    delete: proc("sku_rules.manage")
      .route({ method: "DELETE", path: "/{id}" })
      .input(z.object({ id: Id }))
      .output(Ok),
    /** Dry-run a pattern against a sample SKU without saving. */
    test: proc("sku_rules.read")
      .route({ method: "POST", path: "/test" })
      .input(
        z.object({
          patternType: z.enum(SKU_PATTERN_TYPES),
          pattern: z.string().min(1),
          target: SkuRuleTarget,
          sample: z.string().min(1),
        }),
      )
      .output(SkuMatchResult),
    /** Distinct channel SKUs with items in needs_mapping, most urgent first. */
    unmapped: proc("sku_rules.read")
      .route({ method: "GET", path: "/unmapped" })
      .input(Page.extend({ channel: z.enum(CHANNELS).optional(), search: z.string().optional() }))
      .output(
        paginated(UnmappedSku).extend({
          totalSkus: z.number().int().nonnegative(),
          totalItems: z.number().int().nonnegative(),
        }),
      ),
    /** Heuristic (pattern inference over existing rules and catalog codes) or AI suggestions. */
    suggest: proc("sku_rules.read")
      .route({ method: "POST", path: "/suggest" })
      .input(
        z.object({
          channelSkus: z.array(z.string().min(1)).min(1).max(200),
          useAi: z.boolean().default(true),
        }),
      )
      .output(
        z.object({ items: z.array(SkuSuggestion), creditsUsed: z.number().int().nonnegative() }),
      ),
    /** Apply many mappings at once (the "accept all suggestions" button). */
    bulkApply: proc("sku_rules.manage")
      .route({ method: "POST", path: "/bulk-apply" })
      .input(
        z.object({
          mappings: z
            .array(
              z.object({
                channelSku: z.string().min(1),
                channel: z.enum(CHANNELS).optional(),
                designId: Id,
                blankVariantId: Id,
                saveRule: SkuRuleInput.optional(),
              }),
            )
            .min(1)
            .max(500),
        }),
      )
      .output(
        z.object({
          itemsMapped: z.number().int().nonnegative(),
          rulesCreated: z.number().int().nonnegative(),
          failed: z.array(z.object({ channelSku: z.string(), message: z.string() })),
        }),
      ),
  });
