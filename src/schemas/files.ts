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
