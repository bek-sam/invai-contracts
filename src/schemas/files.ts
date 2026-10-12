import { z } from "zod";
import { Timestamp } from "./common";

/** Determines the key prefix, allowed content types and size limit. */
export const FILE_KINDS = [
  "design", // print files: png/svg/pdf, up to 200 MB
  "artwork", // rendered personalization
  "template_background",
  "csv", // order or blank imports
  "photo", // personalization photo uploads
  "mockup",
  "other",
] as const;

export const PresignUploadInput = z.object({
  kind: z.enum(FILE_KINDS),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
});

/** PUT the bytes to `uploadUrl` with the given headers, then use `fileKey` in other calls. */
export const PresignedUpload = z.object({
  fileKey: z.string(),
  uploadUrl: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: Timestamp,
});
export type PresignedUpload = z.infer<typeof PresignedUpload>;

export const SignedDownload = z.object({
  fileKey: z.string(),
  url: z.url(),
  expiresAt: Timestamp,
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
});
export type SignedDownload = z.infer<typeof SignedDownload>;

/** Most keys one `files.downloadUrls` call signs. Sized for a Pick screen (about 27 thumbnails) with headroom. */
export const MAX_DOWNLOAD_URLS = 60;

/**
 * Input of `files.downloadUrls`. Duplicate keys are allowed: the output has one item per input
 * position, so a screen can map results by index without de-duplicating first.
 */
export const DownloadUrlsInput = z.object({
  fileKeys: z.array(z.string().min(1).max(1024)).min(1).max(MAX_DOWNLOAD_URLS),
  disposition: z.enum(["inline", "attachment"]).default("inline"),
});
export type DownloadUrlsInput = z.infer<typeof DownloadUrlsInput>;

/** `download` is null where the single `files.downloadUrl` call would answer NOT_FOUND. */
export const DownloadUrlsOutput = z.object({
  items: z.array(z.object({ fileKey: z.string(), download: SignedDownload.nullable() })),
});
export type DownloadUrlsOutput = z.infer<typeof DownloadUrlsOutput>;
