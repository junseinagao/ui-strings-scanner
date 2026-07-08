import type { StringKind } from "./types.ts";

export type CopyContext = {
  kind: StringKind;
  attr?: string;
  callee?: string;
  key?: string;
};

export type Detector = {
  /** Context-aware copy detection (decides whether an entry is kept) */
  isCopy: (text: string, context: CopyContext) => boolean;
  /** Context-free "contains copy" check (e.g. whether an expression can be collapsed into a placeholder) */
  hasCopyText: (text: string) => boolean;
};

// ---- Script-independent copy detection based on structure (where the string is written) plus lexical shape (what it looks like).
// Non-Latin text (Japanese, etc.) is always treated as copy regardless of slot, so on Japanese codebases this fully covers what a CJK character-class regex would detect. ----

/** Attributes that usually hold copy (kept when the value contains letters) */
const COPY_ATTR_PATTERN =
  /^(aria-(label|description|valuetext|placeholder|roledescription)|placeholder|title|alt|label|legend|summary|description|helperText|errorMessage|emptyText|tooltip|caption|heading|subtitle)$/i;

/** Attributes that only hold technical values (rejected immediately) */
const TECHNICAL_ATTRS = new Set([
  "className",
  "class",
  "id",
  "style",
  "href",
  "src",
  "srcSet",
  "srcset",
  "to",
  "path",
  "type",
  "name",
  "key",
  "rel",
  "target",
  "role",
  "htmlFor",
  "for",
  "variant",
  "size",
  "color",
  "width",
  "height",
  "method",
  "action",
  "autoComplete",
  "loading",
  "decoding",
  "lang",
  "dir",
  "form",
  "value",
  "defaultValue",
]);

/** Object keys that usually hold copy */
const COPY_KEY_PATTERN =
  /(label|title|message|description|text|placeholder|error|success|warning|hint|help|caption|heading|subtitle|tooltip|empty|confirm|cancel|body|summary)/i;

/** Object keys that only hold technical values (rejected immediately) */
const TECHNICAL_KEYS = new Set([
  "className",
  "id",
  "href",
  "src",
  "key",
  "name",
  "type",
  "variant",
  "value",
  "path",
  "url",
  "icon",
  "color",
  "size",
  "target",
  "rel",
  "method",
  "field",
  "slug",
  "locale",
  "format",
  "testId",
  // dangerouslySetInnerHTML payloads are code/markup; the non-Latin early return still surfaces Japanese copy inside them
  "__html",
]);

/** Class-name utility callees (their arguments are never copy) */
const CLASSNAME_CALLEES = new Set([
  "cn",
  "cx",
  "clsx",
  "classnames",
  "classNames",
  "cva",
  "tw",
  "twMerge",
  "twJoin",
]);

const URLISH = /^(https?:\/\/|mailto:|tel:|www\.|[./#~@])/;
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
/** Single SCREAMING_CASE / snake_case / kebab-case token */
const IDENTIFIER_TOKEN = /^[A-Za-z0-9]+([-_][A-Za-z0-9\[\]%./:#]+)+$/;
const CONSTANT_TOKEN = /^[A-Z0-9_]+$/;

/** Whether the text contains a letter outside the Latin range (Japanese, etc.); such text is always a copy candidate */
const hasNonLatinLetter = (text: string): boolean => {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x2ff && /[\p{L}\p{Nl}]/u.test(ch)) {
      return true;
    }
  }
  return false;
};

/** Judge whether text looks like English copy from its token shapes */
const looksLikeEnglishCopy = (text: string): boolean => {
  const trimmed = text.trim();
  if (!/[A-Za-z]/.test(trimmed)) {
    return false;
  }
  if (URLISH.test(trimmed) || HEX_COLOR.test(trimmed)) {
    return false;
  }
  const words = trimmed.split(/\s+/);
  if (words.length === 1) {
    const word = words[0] ?? "";
    if (IDENTIFIER_TOKEN.test(word) || CONSTANT_TOKEN.test(word)) {
      return false;
    }
    // A single word counts only when it looks like natural language: "Save" / "Loading..." / "Done!"
    return /^[A-Z][a-z']+([.!?…]|\.\.\.)?$/.test(word) || /[.!?…]$/.test(word);
  }
  // Multiple words: if many tokens mix symbols or digits, treat as class names or similar
  const technical = words.filter(
    (word) =>
      /[-_:\[\]{}/\\#@=]|\d/.test(word) && !/^[A-Za-z]+[.,:;!?…]*$/.test(word),
  ).length;
  if (technical / words.length > 0.4) {
    return false;
  }
  // Two or more purely alphabetic words in a row look like copy
  const alpha = words.filter((word) =>
    /^[A-Za-z][A-Za-z']*[.,:;!?…]*$/.test(word),
  ).length;
  return alpha >= 2;
};

/** For contexts without structural info: detect non-Latin text or embedded string literals that look like English copy */
const hasCopyTextEn = (text: string): boolean => {
  if (hasNonLatinLetter(text)) {
    return true;
  }
  for (const match of text.matchAll(/["'`]([^"'`\n]*)["'`]/g)) {
    if (looksLikeEnglishCopy(match[1] ?? "")) {
      return true;
    }
  }
  return false;
};

/** Text with {expression} placeholders removed */
const withoutPlaceholders = (text: string): string =>
  text.replace(/\{[^{}]*\}/g, "");

const lexical = (text: string): boolean =>
  hasNonLatinLetter(text) || looksLikeEnglishCopy(text);

const isCopyEn = (text: string, context: CopyContext): boolean => {
  const { kind, attr, callee, key } = context;
  // Non-Latin text (Japanese, etc.) is always treated as copy regardless of slot. Technical slots (className, etc.) practically never hold Japanese, and this keeps cases like value: "未読" (technical key + Japanese value) from being dropped.
  if (hasNonLatinLetter(text)) {
    return true;
  }
  if (kind === "jsx-text") {
    // JSX child text is structurally almost always copy; keep it if letters remain after stripping placeholders
    return /\p{L}/u.test(withoutPlaceholders(text));
  }
  if (kind === "jsx-attribute") {
    if (attr === undefined) {
      return false;
    }
    if (COPY_ATTR_PATTERN.test(attr)) {
      return /\p{L}/u.test(text);
    }
    if (
      TECHNICAL_ATTRS.has(attr) ||
      attr.startsWith("data-") ||
      attr.startsWith("on")
    ) {
      return false;
    }
    return lexical(text);
  }
  if (kind === "object-property" || kind === "metadata") {
    if (key !== undefined) {
      if (COPY_KEY_PATTERN.test(key)) {
        return /\p{L}/u.test(text);
      }
      if (TECHNICAL_KEYS.has(key)) {
        return false;
      }
    }
    return lexical(text);
  }
  if (kind === "call-argument") {
    if (callee !== undefined && CLASSNAME_CALLEES.has(callee)) {
      return false;
    }
    return lexical(text);
  }
  // array-item / internal / other: lexical check only
  return lexical(text);
};

export const detector: Detector = {
  isCopy: isCopyEn,
  hasCopyText: hasCopyTextEn,
};
