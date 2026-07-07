import { describe, expect, test } from "bun:test";
import { type CopyContext, detector } from "../src/detect.ts";

const { isCopy, hasCopyText } = detector;

const cases = (
  name: string,
  rows: Array<[text: string, context: CopyContext, expected: boolean]>,
) => {
  describe(name, () => {
    for (const [text, context, expected] of rows) {
      test(`${JSON.stringify(text)} (${JSON.stringify(context)}) → ${expected}`, () => {
        expect(isCopy(text, context)).toBe(expected);
      });
    }
  });
};

cases("isCopy: non-Latin text is always copy", [
  ["保存する", { kind: "jsx-attribute", attr: "className" }, true],
  ["メニュー", { kind: "call-argument", callee: "cn" }, true],
  ["未読", { kind: "object-property", key: "value" }, true],
  ["読み込み中…", { kind: "other" }, true],
]);

cases("isCopy: jsx-text", [
  ["Hello world", { kind: "jsx-text" }, true],
  ["{count}", { kind: "jsx-text" }, false],
  ["{count} items", { kind: "jsx-text" }, true],
  ["123", { kind: "jsx-text" }, false],
]);

cases("isCopy: jsx-attribute", [
  // Copy attributes accept any value with letters, even a single lowercase word
  ["logo", { kind: "jsx-attribute", attr: "alt" }, true],
  ["Enter your email", { kind: "jsx-attribute", attr: "placeholder" }, true],
  ["Close", { kind: "jsx-attribute", attr: "aria-label" }, true],
  // Technical attributes are rejected even for natural-looking text
  ["Save your changes", { kind: "jsx-attribute", attr: "className" }, false],
  ["/about", { kind: "jsx-attribute", attr: "href" }, false],
  ["submit-button", { kind: "jsx-attribute", attr: "data-testid" }, false],
  ["Handle click", { kind: "jsx-attribute", attr: "onClick" }, false],
  // Unknown attributes fall back to the lexical check
  ["Welcome to our site", { kind: "jsx-attribute", attr: "tagline" }, true],
  ["btn-primary", { kind: "jsx-attribute", attr: "tagline" }, false],
]);

cases("isCopy: object-property / metadata", [
  ["Save", { kind: "object-property", key: "label" }, true],
  ["Something went wrong", { kind: "object-property", key: "errorMessage" }, true],
  ["About Us", { kind: "metadata", key: "title" }, true],
  ["some-post", { kind: "object-property", key: "slug" }, false],
  ["main-button", { kind: "object-property", key: "testId" }, false],
  // Unknown keys fall back to the lexical check
  ["Total due", { kind: "object-property", key: "amount" }, true],
  ["USD_TOTAL", { kind: "object-property", key: "amount" }, false],
]);

cases("isCopy: call-argument", [
  ["Nice readable text", { kind: "call-argument", callee: "cn" }, false],
  ["px-2 py-1", { kind: "call-argument", callee: "clsx" }, false],
  ["Something went wrong", { kind: "call-argument", callee: "alert" }, true],
  ["Name is required", { kind: "call-argument", callee: "min" }, true],
]);

cases("isCopy: lexical heuristics (kind: other)", [
  ["Save", { kind: "other" }, true],
  ["Loading...", { kind: "other" }, true],
  ["Done!", { kind: "other" }, true],
  ["save", { kind: "other" }, false],
  ["SCREAMING_CASE", { kind: "other" }, false],
  ["kebab-case-token", { kind: "other" }, false],
  ["#ffcc00", { kind: "other" }, false],
  ["https://example.com", { kind: "other" }, false],
  ["./relative/path", { kind: "other" }, false],
  ["mailto:someone@example.com", { kind: "other" }, false],
  ["Save changes", { kind: "other" }, true],
  ["An error occurred.", { kind: "other" }, true],
  ["flex items-center gap-2 px-4", { kind: "other" }, false],
]);

describe("hasCopyText", () => {
  test("non-Latin text counts as copy", () => {
    expect(hasCopyText("和文を含む式")).toBe(true);
  });
  test("embedded string literal that looks like copy", () => {
    expect(hasCopyText('cond ? "Save changes" : "Cancel"')).toBe(true);
  });
  test("backtick-quoted copy", () => {
    expect(hasCopyText("`Hello there`")).toBe(true);
  });
  test("expression without strings", () => {
    expect(hasCopyText("a ? b : c")).toBe(false);
  });
  test("technical string literal", () => {
    expect(hasCopyText('cn("btn-primary")')).toBe(false);
  });
});
