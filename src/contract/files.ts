import { z } from "zod";
import { PresignedUpload, PresignUploadInput, SignedDownload } from "../schemas/files";
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
  });
