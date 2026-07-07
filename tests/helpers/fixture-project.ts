import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Write the given files into a fresh temp directory and return its path */
export const makeFixtureProject = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "ui-strings-fixture-"));
  for (const [path, content] of Object.entries(files)) {
    const filePath = join(dir, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return dir;
};

export const removeFixtureProject = (dir: string): void => {
  rmSync(dir, { recursive: true, force: true });
};
