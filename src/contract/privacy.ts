import { z } from "zod";
import { Id, Ok, Timestamp } from "../schemas/common";
import { Job } from "../schemas/production";
import { base, proc } from "./_base";

/**
 * Whole-company data export and deletion (B-23, wave 12 T-12-4). Owner only: `org.export` and
 * `org.delete` are carved out of `admin`.
 * - Export: a `tenant_export` job zips one JSON and one CSV file per company table plus the
 *   company's uploaded files. When it is `done`, `resultIds[0]` is the zip's file id and its key is
 *   `{companyId}/tenant-export/{fileId}.zip`: fetch it with `files.downloadUrl`.
 * - Delete: soft delete now, hard purge of every row and stored file 30 days later unless
 *   cancelled first.
 */
export const privacy = base
  .prefix("/privacy")
  .tag("privacy")
  .router({
    exportTrigger: proc("org.export")
      .route({ method: "POST", path: "/export" })
      .input(z.object({}))
      .output(Job) // kind "tenant_export"
      .errors({
        EXPORT_IN_PROGRESS: {
          status: 409,
          message: "An export is already running",
          data: z.object({ jobId: Id, startedAt: Timestamp }),
        },
      }),
    exportStatus: proc("org.export")
      .route({ method: "GET", path: "/export/{jobId}" })
      .input(z.object({ jobId: Id }))
      .output(Job),
    deleteRequest: proc("org.delete")
      .route({ method: "POST", path: "/delete-request" })
      .input(z.object({ confirm: z.literal(true) }))
      .output(z.object({ scheduledPurgeAt: Timestamp }))
      .errors({
        DELETION_ALREADY_REQUESTED: {
          status: 409,
          message: "Deletion is already scheduled",
          data: z.object({ scheduledPurgeAt: Timestamp }),
        },
      }),
    deleteCancel: proc("org.delete")
      .route({ method: "POST", path: "/delete-cancel" })
      .input(z.object({}))
      .output(Ok)
      .errors({ NO_DELETION_PENDING: { status: 404, message: "No deletion is pending" } }),
    deleteStatus: proc("org.export")
      .route({ method: "GET", path: "/delete-status" })
      .input(z.object({}))
      .output(
        z.object({
          status: z.enum(["active", "soft_deleted"]),
          scheduledPurgeAt: Timestamp.nullable(),
        }),
      ),
  });
