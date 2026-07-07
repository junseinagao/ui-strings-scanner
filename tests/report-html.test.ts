import { describe, expect, test } from "bun:test";
import { renderHtml } from "../src/report-html.ts";
import { entry, result } from "./helpers/result-builder.ts";

const embeddedJson = (html: string): unknown => {
  const match = html.match(/<script type="application\/json" id="data">(.*?)<\/script>/s);
  if (!match) {
    throw new Error("embedded data script not found");
  }
  return JSON.parse(match[1] ?? "");
};

describe("renderHtml: document shell", () => {
  const res = result([entry()]);
  const html = renderHtml(res);

  test("is a full HTML document in English", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en">');
  });

  test("title contains the project directory basename", () => {
    expect(html).toContain("<title>UI Strings — example-project</title>");
  });

  test("contains the data script and the app script", () => {
    expect(html).toContain('<script type="application/json" id="data">');
    expect(html.match(/<script>/g)?.length).toBe(1);
  });
});

describe("renderHtml: embedded JSON round-trip", () => {
  test("the full ScanResult survives embedding", () => {
    const res = result([
      entry({ text: 'He said "hello" & left', condition: "a < b", branch: "then" }),
      entry({ text: "Bold <b>text</b>", kind: "jsx-attribute", attr: "title", surface: "a11y" }),
    ]);
    expect(embeddedJson(renderHtml(res))).toEqual(res);
  });
});

describe("renderHtml: </script> injection", () => {
  const hostile = "</script><script>alert(1)</script>";
  const res = result([entry({ text: hostile })]);
  const html = renderHtml(res);

  test("entry text cannot close the data script", () => {
    // Only the two real closers remain: the data script and the app script
    expect(html.split("</script>").length - 1).toBe(2);
    expect(html).toContain("\\u003c/script");
  });

  test("the hostile text round-trips intact", () => {
    const parsed = embeddedJson(html) as { entries: Array<{ text: string }> };
    expect(parsed.entries[0]?.text).toBe(hostile);
  });
});
