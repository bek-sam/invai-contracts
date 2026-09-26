# Changelog

## 0.3.0

- Added `CONTRACT_VERSION`, `CONTRACT_VERSION_HEADER` and version helpers (`src/compat.ts`) for the floor API version handshake (T-13-1, B-82, ADR 0012).
- Added `FLOOR_COMPAT_BASELINE` (0.3.0), the default floor minimum; raised by hand only for floor-facing breaking changes.
- Added `CLIENT_TOO_OLD` (HTTP 426, `data: { minVersion, current }`) to `COMMON_ERRORS`.

## 0.2.0

- Baseline before versioned changes were recorded.
