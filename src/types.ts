export type StringKind =
  | "jsx-text"
  | "jsx-attribute"
  | "call-argument"
  | "object-property"
  | "array-item"
  | "metadata"
  | "internal"
  | "other";

export type Surface = "visible" | "interactive" | "a11y" | "meta" | "internal";

export const SURFACES: Surface[] = [
  "visible",
  "interactive",
  "a11y",
  "meta",
  "internal",
];

export type StringEntry = {
  text: string;
  file: string;
  line: number;
  kind: StringKind;
  /** How the string reaches the user (always visible / after interaction / assistive tech only, etc.) */
  surface: Surface;
  /** JSX attribute name (kind: jsx-attribute) */
  attr?: string;
  /** callee name (kind: call-argument) */
  callee?: string;
  /** object property key, or variable name of an array constant (kind: object-property / metadata / array-item) */
  key?: string;
  /** enclosing JSX element name (kind: jsx-text) / element the array is rendered into (kind: array-item) */
  tag?: string;
  /** render site as `file:line` (kind: array-item, evidence for the link) */
  usedAt?: string;
  /** start line of the owning JSX element (kind: jsx-attribute, used for sort order) */
  elementLine?: number;
  /** expression text of the branching condition */
  condition?: string;
  /** whether the string shows on the true (then) or false (else) side of the condition */
  branch?: "then" | "else";
  /** logical group (route or directory) */
  group: string;
};

export type ScanResult = {
  projectDir: string;
  srcGlob: string;
  scannedFiles: number;
  generatedAt: string;
  entries: StringEntry[];
};
