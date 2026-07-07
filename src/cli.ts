#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { scanProject } from "./extract.ts";
import { renderHtml } from "./report-html.ts";
import { renderMarkdown } from "./report-md.ts";
import type { Surface } from "./types.ts";

const program = new Command();

program
  .name("ui-strings")
  .description(
    "Extract user-reachable UI strings from a React (TS/TSX) codebase and generate reports",
  )
  .version("0.1.0");

program
  .command("scan")
  .argument(
    "[projectDir]",
    "root directory of the target project",
    ".",
  )
  .option("--src <glob>", "glob of files to scan", "src/**/*.{ts,tsx,js,jsx}")
  .option(
    "--exclude <globs>",
    "extra exclude globs (comma-separated; test/spec/__tests__ are always excluded)",
    "",
  )
  .option("--out <dir>", "output directory", "./ui-strings-report")
  .option("--format <list>", "output formats (json,md,html)", "json,md,html")
  .option(
    "--include-internal",
    "include console/throw strings in the Markdown listing",
    false,
  )
  .option("--open", "open the HTML report in a browser after generation", false)
  .action(
    async (
      projectDirArg: string,
      options: {
        src: string;
        exclude: string;
        out: string;
        format: string;
        includeInternal: boolean;
        open: boolean;
      },
    ) => {
      const projectDir = resolve(projectDirArg);
      const formats = new Set(
        options.format.split(",").map((format) => format.trim()),
      );

      console.log(pc.dim(`Scanning: ${projectDir}/${options.src}`));
      const result = scanProject({
        projectDir,
        srcGlob: options.src,
        exclude: options.exclude
          .split(",")
          .map((glob) => glob.trim())
          .filter((glob) => glob !== ""),
      });

      const visibleEntries = options.includeInternal
        ? result.entries
        : result.entries.filter((entry) => entry.kind !== "internal");

      const outDir = resolve(options.out);
      mkdirSync(outDir, { recursive: true });
      const written: string[] = [];
      if (formats.has("json")) {
        const path = join(outDir, "ui-strings.json");
        writeFileSync(path, JSON.stringify(result, null, 2));
        written.push(path);
      }
      if (formats.has("md")) {
        const path = join(outDir, "ui-strings.md");
        writeFileSync(path, renderMarkdown(result, visibleEntries));
        written.push(path);
      }
      let htmlPath: string | undefined;
      if (formats.has("html")) {
        htmlPath = join(outDir, "ui-strings.html");
        writeFileSync(htmlPath, renderHtml(result));
        written.push(htmlPath);
      }

      const surfaceCounts = new Map<Surface, number>();
      for (const entry of result.entries) {
        surfaceCounts.set(
          entry.surface,
          (surfaceCounts.get(entry.surface) ?? 0) + 1,
        );
      }
      const internalCount = surfaceCounts.get("internal") ?? 0;

      console.log();
      console.log(
        pc.bold(
          `${pc.green(String(visibleEntries.length))} strings` +
            (internalCount > 0 ? pc.dim(` (+${internalCount} internal)`) : ""),
        ) + pc.dim(` / ${result.scannedFiles} files scanned`),
      );
      for (const [surface, count] of [...surfaceCounts.entries()].sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`  ${surface.padEnd(12)} ${count}`);
      }
      console.log();
      for (const path of written) {
        console.log(pc.dim(`→ ${path}`));
      }

      if (options.open && htmlPath) {
        const opener =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        spawn(opener, [htmlPath], { detached: true, stdio: "ignore" }).unref();
      }
    },
  );

await program.parseAsync();
