import type { ScanResult, StringEntry } from "../../src/types.ts";

/** StringEntry factory with sane defaults for report tests */
export const entry = (overrides: Partial<StringEntry> = {}): StringEntry => ({
  text: "Hello world",
  file: "src/app/page.tsx",
  line: 1,
  kind: "jsx-text",
  surface: "visible",
  group: "/",
  ...overrides,
});

/** Deterministic ScanResult factory (fixed generatedAt) */
export const result = (
  entries: StringEntry[],
  overrides: Partial<ScanResult> = {},
): ScanResult => ({
  projectDir: "/tmp/example-project",
  srcGlob: "src/**/*.{ts,tsx,js,jsx}",
  scannedFiles: 3,
  generatedAt: "2026-01-01T00:00:00.000Z",
  entries,
  ...overrides,
});
