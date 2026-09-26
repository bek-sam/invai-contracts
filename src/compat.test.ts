import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };
import {
  CONTRACT_VERSION,
  compareContractVersions,
  FLOOR_COMPAT_BASELINE,
  isContractVersionAtLeast,
  parseContractVersion,
} from "./compat";

describe("contract version handshake helpers", () => {
  it("CONTRACT_VERSION matches package.json", () => {
    expect(CONTRACT_VERSION).toBe(pkg.version);
  });

  it("the floor baseline is a real version no newer than CONTRACT_VERSION", () => {
    expect(parseContractVersion(FLOOR_COMPAT_BASELINE)).not.toBeNull();
    expect(compareContractVersions(FLOOR_COMPAT_BASELINE, CONTRACT_VERSION)).toBeLessThanOrEqual(0);
  });

  it("parses x.y.z and rejects garbage", () => {
    expect(parseContractVersion("0.3.0")).toEqual([0, 3, 0]);
    expect(parseContractVersion("1.2.3-rc.1")).toEqual([1, 2, 3]);
    expect(parseContractVersion("0.3")).toBeNull();
    expect(parseContractVersion("")).toBeNull();
    expect(parseContractVersion(null)).toBeNull();
  });

  it("compares numerically, not lexically", () => {
    expect(compareContractVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareContractVersions("0.2.9", "0.3.0")).toBeLessThan(0);
    expect(compareContractVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("a missing or old version is not at least the minimum", () => {
    expect(isContractVersionAtLeast("0.3.0", "0.3.0")).toBe(true);
    expect(isContractVersionAtLeast("0.4.1", "0.3.0")).toBe(true);
    expect(isContractVersionAtLeast("0.2.0", "0.3.0")).toBe(false);
    expect(isContractVersionAtLeast(undefined, "0.3.0")).toBe(false);
    expect(isContractVersionAtLeast("junk", "0.0.0")).toBe(false);
  });
});
