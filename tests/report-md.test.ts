import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/report-md.ts";
import { entry, result } from "./helpers/result-builder.ts";

describe("renderMarkdown: structure", () => {
  const res = result([
    entry({ text: "Hello world", line: 3 }),
    entry({ text: "Company logo", kind: "jsx-attribute", attr: "alt", surface: "a11y", line: 5 }),
    entry({ text: "About the team", file: "src/app/about/page.tsx", group: "/about", line: 2 }),
  ]);
  const md = renderMarkdown(res, res.entries);

  test("starts with the report title", () => {
    expect(md.startsWith("# UI Strings\n")).toBe(true);
  });

  test("includes target, timestamp, and counts", () => {
    expect(md).toContain("- Target: `/tmp/example-project` (`src/**/*.{ts,tsx,js,jsx}`)");
    expect(md).toContain("- Generated: 2026-01-01T00:00:00.000Z");
    expect(md).toContain("- Strings: **3** / Files scanned: 3");
  });

  test("summary tables count by surface, kind, and group", () => {
    expect(md).toContain("## Count by surface");
    expect(md).toContain("| `visible` | 2 |");
    expect(md).toContain("| `a11y` | 1 |");
    expect(md).toContain("## Count by kind");
    expect(md).toContain("| `jsx-text` | 2 |");
    expect(md).toContain("| `jsx-attribute` | 1 |");
    expect(md).toContain("## Count by group");
    expect(md).toContain("| / | 2 |");
    expect(md).toContain("| /about | 1 |");
  });

  test("listing has group and file sections with table headers", () => {
    expect(md).toContain("### /");
    expect(md).toContain("### /about");
    expect(md).toContain("#### src/app/page.tsx");
    expect(md).toContain("#### src/app/about/page.tsx");
    expect(md).toContain("| line | surface | context | text |");
  });
});

describe("renderMarkdown: cell escaping", () => {
  test("pipes are escaped and newlines become <br>", () => {
    const res = result([entry({ text: "a|b\nc" })]);
    const md = renderMarkdown(res, res.entries);
    expect(md).toContain("a\\|b<br>c");
  });
});

describe("renderMarkdown: context column", () => {
  test("array-item renders key and render tag", () => {
    const res = result([entry({ kind: "array-item", key: "options", tag: "li", text: "Literature" })]);
    expect(renderMarkdown(res, res.entries)).toContain("`options` → `<li>`");
  });

  test("attribute, callee, and key contexts", () => {
    const res = result([
      entry({ kind: "jsx-attribute", attr: "placeholder", text: "Enter your email" }),
      entry({ kind: "call-argument", callee: "min", text: "Name is required" }),
      entry({ kind: "object-property", key: "message", text: "Sent" }),
    ]);
    const md = renderMarkdown(res, res.entries);
    expect(md).toContain("`placeholder=`");
    expect(md).toContain("`min()`");
    expect(md).toContain("`message:`");
  });

  test("condition renders negated on the else branch", () => {
    const res = result([
      entry({ text: "Open menu", condition: "isOpen", branch: "else" }),
      entry({ text: "Close menu", condition: "isOpen", branch: "then" }),
    ]);
    const md = renderMarkdown(res, res.entries);
    expect(md).toContain("cond: `!(isOpen)`");
    expect(md).toContain("cond: `isOpen`");
  });
});

describe("renderMarkdown: visibleEntries filtering", () => {
  test("entries outside visibleEntries are omitted and counts reflect the filter", () => {
    const internal = entry({ text: "Failed to send email", kind: "internal", surface: "internal" });
    const visible = entry({ text: "Hello world" });
    const res = result([visible, internal]);
    const md = renderMarkdown(res, [visible]);
    expect(md).toContain("- Strings: **1**");
    expect(md).not.toContain("Failed to send email");
  });
});
