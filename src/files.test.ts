import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, FLOOR_COMPAT_BASELINE, isContractVersionAtLeast } from "./compat";
import { contract, listProcedures, PROCEDURE_PERMISSIONS } from "./contract";
import { DownloadUrlsInput, DownloadUrlsOutput, MAX_DOWNLOAD_URLS } from "./schemas/files";

describe("files.downloadUrls (0.15.0)", () => {
  it("is a POST with floor auth and the files.read permission", () => {
    const route = contract.files.downloadUrls["~orpc"].route;
    expect(route.method).toBe("POST");
    expect(route.path).toBe("/files/download-urls");
    expect(PROCEDURE_PERMISSIONS["files.downloadUrls"]).toBe("files.read");
    expect(listProcedures(contract).find((p) => p.path === "files.downloadUrls")?.meta.auth).toBe(
      "floor",
    );
  });

  it("keeps files.downloadUrl as it was", () => {
    expect(contract.files.downloadUrl["~orpc"].route.path).toBe("/files/download-url");
  });

  it("rejects an empty list and a list over the cap, accepts the cap and duplicates", () => {
    expect(DownloadUrlsInput.safeParse({ fileKeys: [] }).success).toBe(false);
    const key = (i: number) => `c/${i}.png`;
    const over = Array.from({ length: MAX_DOWNLOAD_URLS + 1 }, (_, i) => key(i));
    expect(DownloadUrlsInput.safeParse({ fileKeys: over }).success).toBe(false);
    expect(
      DownloadUrlsInput.safeParse({ fileKeys: over.slice(0, MAX_DOWNLOAD_URLS) }).success,
    ).toBe(true);
    expect(DownloadUrlsInput.safeParse({ fileKeys: ["a", "a"] }).success).toBe(true);
    expect(DownloadUrlsInput.safeParse({ fileKeys: [""] }).success).toBe(false);
    expect(DownloadUrlsInput.safeParse({ fileKeys: ["x".repeat(1025)] }).success).toBe(false);
  });

  it("defaults disposition to inline", () => {
    expect(DownloadUrlsInput.parse({ fileKeys: ["a"] }).disposition).toBe("inline");
    expect(DownloadUrlsInput.safeParse({ fileKeys: ["a"], disposition: "zip" }).success).toBe(
      false,
    );
  });

  it("parses an output with a null item", () => {
    const out = DownloadUrlsOutput.parse({
      items: [
        {
          fileKey: "a",
          download: {
            fileKey: "a",
            url: "https://example.test/a",
            expiresAt: "2026-10-12T10:15:00.000Z",
            contentType: "image/png",
            sizeBytes: 10,
          },
        },
        { fileKey: "b", download: null },
      ],
    });
    expect(out.items[1]?.download).toBeNull();
  });

  it("is at least 0.15.0 and leaves the floor baseline alone", () => {
    expect(isContractVersionAtLeast(CONTRACT_VERSION, "0.15.0")).toBe(true);
    expect(isContractVersionAtLeast(FLOOR_COMPAT_BASELINE, "0.15.0")).toBe(false);
  });
});
