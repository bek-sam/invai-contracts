/**
 * Floor API version handshake (T-13-1, B-82, ADR 0012).
 *
 * The floor sends `CONTRACT_VERSION` in the `X-Contract-Version` header on every request. The
 * backend refuses floor/station calls below its `MIN_FLOOR_CONTRACT_VERSION` with
 * `CLIENT_TOO_OLD` (426). `CONTRACT_VERSION` must equal `package.json` `version`; a test holds it.
 */
export const CONTRACT_VERSION = "0.9.0";

/**
 * Oldest contracts version whose floor/station-facing shapes the backend still accepts: the
 * default for the backend's `MIN_FLOOR_CONTRACT_VERSION`. Raised by hand only when a floor-facing
 * breaking change's 14-day window closes (ADR 0012 §5), with a CHANGELOG line saying so. Never
 * tied to `CONTRACT_VERSION`, so a web-only or additive bump doesn't make tablets update.
 */
export const FLOOR_COMPAT_BASELINE = "0.3.0";

/** Header name (HTTP headers are case-insensitive; Node/fetch lower-case it). */
export const CONTRACT_VERSION_HEADER = "x-contract-version";

/** `[major, minor, patch]`, or null if the string isn't a plain `x.y.z` (a `-pre` suffix is ignored). */
export function parseContractVersion(
  v: string | null | undefined,
): [number, number, number] | null {
  if (!v) return null;
  const m = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?\s*$/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Negative if a < b, 0 if equal, positive if a > b. Unparseable versions sort below everything. */
export function compareContractVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const pa = parseContractVersion(a);
  const pb = parseContractVersion(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/** True when `version` is a parseable version `>= min`. A missing or garbled version is never enough. */
export function isContractVersionAtLeast(version: string | null | undefined, min: string): boolean {
  if (!parseContractVersion(version)) return false;
  return compareContractVersions(version, min) >= 0;
}
