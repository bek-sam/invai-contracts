import { describe, expect, it } from "vitest";
import changelog from "../CHANGELOG.md?raw";
import pkg from "../package.json" with { type: "json" };
import { CONTRACT_VERSION } from "./compat";

const headings = changelog
  .split("\n")
  .filter((l) => l.startsWith("## "))
  .map((l) => l.slice(3).trim());

describe("CHANGELOG.md (B-442)", () => {
  it("has a heading for the current package.json version", () => {
    expect(pkg.version).toBe(CONTRACT_VERSION);
    expect(headings.some((h) => h === pkg.version || h.startsWith(`${pkg.version} `))).toBe(true);
  });

  it("has a heading for every minor from 0.6 to the current one", () => {
    const [major, minor] = pkg.version.split(".").map(Number);
    expect(major).toBe(0);
    const missing: string[] = [];
    for (let m = 6; m <= (minor as number); m++) {
      if (!headings.some((h) => h.startsWith(`0.${m}.`))) missing.push(`0.${m}.x`);
    }
    expect(missing).toEqual([]);
  });
});
