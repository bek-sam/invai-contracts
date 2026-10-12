import { z } from "zod";
import {
  DownloadUrlsInput,
  DownloadUrlsOutput,
  PresignedUpload,
  PresignUploadInput,
  SignedDownload,
} from "../schemas/files";
import { base, proc } from "./_base";

export const files = base
  .prefix("/files")
  .tag("files")
  .router({
    /** Direct-to-S3 (MinIO locally) upload. The key is scoped to the org; reuse it in other calls. */
    presignUpload: proc("files.upload")
      .route({ method: "POST", path: "/presign" })
      .input(PresignUploadInput)
      .output(PresignedUpload)
      .errors({
        FILE_TOO_LARGE: {
          status: 413,
          message: "File exceeds the limit for this kind",
          data: z.object({ maxBytes: z.number() }),
        },
        UNSUPPORTED_TYPE: { status: 415, message: "Content type not allowed for this kind" },
      }),
    /** Short-lived signed URL (15 min). Vendors may only read sheet files shared with them. */
    downloadUrl: proc("files.read", { auth: "floor" })
      .route({ method: "POST", path: "/download-url" })
      .input(
        z.object({
          fileKey: z.string().min(1),
          disposition: z.enum(["inline", "attachment"]).default("inline"),
        }),
      )
      .output(SignedDownload),
    /**
     * Sign up to 60 files in one call (B-362: a floor screen used to presign each thumbnail, about 27
     * reads per Pick open, which drains a shop's read burst). A bounded batch, not a list: no cursor.
     * POST, because keys are long and GET query strings land in access logs.
     * Each key follows the rules of `files.downloadUrl` (company prefix, vendor sheet rule, kind
     * permissions, SVG forced to attachment) and the same 15 minute TTL. Output is one item per input
     * position, in input order, duplicates included. `download` is null exactly where the single call
     * answers NOT_FOUND (unsafe key, other company, vendor key outside its sheets, kind not permitted,
     * missing object), so one bad key never fails the screen and nothing is revealed that N single calls
     * would not. Any other failure (storage down, timeout) fails the whole call.
     * One call costs one `reads` rate token, however many keys it carries.
     */
    downloadUrls: proc("files.read", { auth: "floor" })
      .route({ method: "POST", path: "/download-urls" })
      .input(DownloadUrlsInput)
      .output(DownloadUrlsOutput),
  });
