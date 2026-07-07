import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScanResult } from "../src/types.ts";
import { makeFixtureProject, removeFixtureProject } from "./helpers/fixture-project.ts";

setDefaultTimeout(30_000);

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

const run = (args: string[], cwd?: string) => {
  const proc = Bun.spawnSync(["bun", CLI, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
};

let projectDir: string;
const outDirs: string[] = [];
const makeOutDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ui-strings-out-"));
  outDirs.push(dir);
  return dir;
};

beforeAll(() => {
  projectDir = makeFixtureProject({
    "src/app/page.tsx": `export default function Page() {
  return (
    <div>
      <h1>Welcome back</h1>
      <input placeholder="Enter your email" />
    </div>
  );
}
`,
    "src/app/api/route.ts": `export function GET() {
  console.error("Internal failure message");
  return Response.json({ message: "Request accepted" });
}
`,
    "src/legacy/old.tsx": `export const Old = () => <p>Legacy page copy</p>;
`,
  });
});
afterAll(() => {
  removeFixtureProject(projectDir);
  for (const dir of outDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scan: default formats", () => {
  test("writes json, md, and html and prints an English summary", () => {
    const out = makeOutDir();
    const { exitCode, stdout } = run(["scan", projectDir, "--out", out]);
    expect(exitCode).toBe(0);

    const jsonPath = join(out, "ui-strings.json");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(join(out, "ui-strings.md"))).toBe(true);
    expect(existsSync(join(out, "ui-strings.html"))).toBe(true);

    const result: ScanResult = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(result.projectDir).toBe(projectDir);
    expect(result.scannedFiles).toBe(3);
    expect(result.entries.length).toBeGreaterThan(0);

    expect(stdout).toContain("Scanning:");
    expect(stdout).toMatch(/\d+ strings/);
    expect(stdout).toContain("files scanned");
    expect(stdout).toContain("(+1 internal)");
    expect(stdout).toContain(jsonPath);
  });
});

describe("scan: --format", () => {
  test("json only", () => {
    const out = makeOutDir();
    const { exitCode } = run(["scan", projectDir, "--out", out, "--format", "json"]);
    expect(exitCode).toBe(0);
    expect(existsSync(join(out, "ui-strings.json"))).toBe(true);
    expect(existsSync(join(out, "ui-strings.md"))).toBe(false);
    expect(existsSync(join(out, "ui-strings.html"))).toBe(false);
  });

  test("md,html leaves json out", () => {
    const out = makeOutDir();
    const { exitCode } = run(["scan", projectDir, "--out", out, "--format", "md,html"]);
    expect(exitCode).toBe(0);
    expect(existsSync(join(out, "ui-strings.json"))).toBe(false);
    expect(existsSync(join(out, "ui-strings.md"))).toBe(true);
    expect(existsSync(join(out, "ui-strings.html"))).toBe(true);
  });
});

describe("scan: --include-internal", () => {
  test("internal strings stay out of the Markdown but always land in the JSON", () => {
    const out = makeOutDir();
    run(["scan", projectDir, "--out", out]);
    const md = readFileSync(join(out, "ui-strings.md"), "utf8");
    const json = readFileSync(join(out, "ui-strings.json"), "utf8");
    expect(md).not.toContain("Internal failure message");
    expect(json).toContain("Internal failure message");
  });

  test("the flag adds internal strings to the Markdown", () => {
    const out = makeOutDir();
    run(["scan", projectDir, "--out", out, "--include-internal"]);
    const md = readFileSync(join(out, "ui-strings.md"), "utf8");
    expect(md).toContain("Internal failure message");
  });
});

describe("scan: --exclude and --src", () => {
  test("--exclude drops matching files", () => {
    const out = makeOutDir();
    run(["scan", projectDir, "--out", out, "--format", "json", "--exclude", "**/legacy/**"]);
    const result: ScanResult = JSON.parse(readFileSync(join(out, "ui-strings.json"), "utf8"));
    expect(result.scannedFiles).toBe(2);
    expect(result.entries.find((e) => e.text === "Legacy page copy")).toBeUndefined();
  });

  test("--src narrows the scanned files", () => {
    const out = makeOutDir();
    run(["scan", projectDir, "--out", out, "--format", "json", "--src", "src/app/**/*.tsx"]);
    const result: ScanResult = JSON.parse(readFileSync(join(out, "ui-strings.json"), "utf8"));
    expect(result.scannedFiles).toBe(1);
  });
});

describe("scan: projectDir defaults to the current directory", () => {
  test("scan without projectDir scans the cwd", () => {
    const out = makeOutDir();
    const { exitCode } = run(["scan", "--out", out, "--format", "json"], projectDir);
    expect(exitCode).toBe(0);
    const result: ScanResult = JSON.parse(
      readFileSync(join(out, "ui-strings.json"), "utf8"),
    );
    expect(result.scannedFiles).toBe(3);
    expect(result.entries.length).toBeGreaterThan(0);
  });
});

describe("argument errors", () => {
  test("unknown command fails", () => {
    const { exitCode } = run(["nope"]);
    expect(exitCode).not.toBe(0);
  });
});
