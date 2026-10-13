// Vite/Vitest `?raw` imports (used by changelog.test.ts); contracts has no @types/node, by design.
declare module "*?raw" {
  const text: string;
  export default text;
}
