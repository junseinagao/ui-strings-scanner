import { existsSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import {
  type Identifier,
  type JsxChild,
  type JsxElement,
  type JsxFragment,
  Node,
  Project,
  SyntaxKind,
  type TemplateExpression,
  ts,
} from "ts-morph";
import { detector } from "./detect.ts";
import type {
  ScanResult,
  StringEntry,
  StringKind,
  Surface,
} from "./types.ts";

type Classified = {
  kind: StringKind;
  attr?: string;
  callee?: string;
  key?: string;
};

/** Inline elements whose text can be joined into the surrounding sentence (lowercase HTML only) */
const INLINE_TAGS = new Set([
  "b",
  "i",
  "em",
  "strong",
  "span",
  "small",
  "a",
  "code",
  "u",
  "s",
  "mark",
  "sup",
  "sub",
  "abbr",
  "ruby",
  "rt",
]);
const BREAK_TAGS = new Set(["br", "wbr"]);

/** Raw-text elements whose children are code, not copy (inline scripts, styled-jsx CSS) */
const RAW_TEXT_TAGS = new Set(["script", "style"]);

const INTERACTIVE_KEY_PATTERN = /^(message|error|success|warning|status)|(message|error)$/i;
const INTERACTIVE_FILE_PATTERN = /(^|\/)(actions|route)\.tsx?$/;

const collapseWhitespace = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

/** `z.string().min` → `min`; other expressions are passed through as-is for the detector */
const calleeName = (expression: Node): string => {
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  return collapseWhitespace(expression.getText()).slice(0, 60);
};

const isConsoleCall = (expression: Node): boolean =>
  Node.isPropertyAccessExpression(expression) &&
  expression.getExpression().getText() === "console";

/** import/export module specifiers are not copy */
const isModuleSpecifier = (node: Node): boolean => {
  const parent = node.getParent();
  return (
    (Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent)) &&
    parent.getModuleSpecifier() === node
  );
};

/** Directives like `"use client"` (a string literal as a whole statement) are not copy */
const isDirective = (node: Node): boolean =>
  Node.isExpressionStatement(node.getParent());

/** Render a template literal as a readable `...{expr}...` string */
const templateToText = (node: TemplateExpression): string => {
  let text = node.getHead().getLiteralText();
  for (const span of node.getTemplateSpans()) {
    text += `{${collapseWhitespace(span.getExpression().getText())}}`;
    text += span.getLiteral().getLiteralText();
  }
  return text;
};

/** Unwrap `expr as const` / `expr satisfies T` / `(expr)` */
const unwrapExpression = (node: Node): Node => {
  let current = node;
  while (
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isParenthesizedExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
};

/** Get the root identifier node, e.g. `facultyOptions.map(...)` → `facultyOptions` */
const rootIdentifierOf = (expression: Node): Identifier | undefined => {
  let current = unwrapExpression(expression);
  while (
    Node.isCallExpression(current) ||
    Node.isPropertyAccessExpression(current) ||
    Node.isElementAccessExpression(current) ||
    Node.isNonNullExpression(current)
  ) {
    current = unwrapExpression(current.getExpression());
  }
  return Node.isIdentifier(current) ? current : undefined;
};

/** Key that uniquely identifies a declaration node within the project */
const declKeyOf = (declaration: Node): string =>
  `${declaration.getSourceFile().getFilePath()}:${declaration.getPos()}`;

/** VariableDeclaration the identifier points to (import aliases are followed via symbol resolution) */
const declarationOf = (identifier: Identifier): Node | undefined => {
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return undefined;
  }
  const aliased = symbol.getAliasedSymbol() ?? symbol;
  return aliased.getDeclarations().find(Node.isVariableDeclaration);
};

const tagNameOf = (element: Node): string | undefined => {
  if (Node.isJsxElement(element)) {
    return element.getOpeningElement().getTagNameNode().getText();
  }
  if (Node.isJsxSelfClosingElement(element)) {
    return element.getTagNameNode().getText();
  }
  return undefined;
};

/** Nearest enclosing JSX element name (for the tag of jsx-text entries) */
const enclosingTag = (node: Node): string | undefined => {
  const element = node.getFirstAncestor(Node.isJsxElement);
  return element ? tagNameOf(element) : undefined;
};

/** Tag name of the JSX element returned by a callback like the one passed to `.map()` */
const returnedJsxTag = (callback: Node | undefined): string | undefined => {
  if (
    callback === undefined ||
    (!Node.isArrowFunction(callback) && !Node.isFunctionExpression(callback))
  ) {
    return undefined;
  }
  const body = callback.getBody();
  const returned = Node.isBlock(body)
    ? body.getStatements().find(Node.isReturnStatement)?.getExpression()
    : body;
  return returned ? tagNameOf(unwrapExpression(returned)) : undefined;
};

/** Tag context of an array constant rendered in a JSX expression (the Tag in `X.map(item => <Tag>)`) */
const renderSiteTag = (jsxExpression: Node): string | undefined => {
  if (!Node.isJsxExpression(jsxExpression)) {
    return undefined;
  }
  const expression = jsxExpression.getExpression();
  if (expression !== undefined) {
    const call = unwrapExpression(expression);
    if (Node.isCallExpression(call)) {
      const callee = call.getExpression();
      if (
        Node.isPropertyAccessExpression(callee) &&
        /^(map|flatMap)$/.test(callee.getName())
      ) {
        const tag = returnedJsxTag(call.getArguments()[0]);
        if (tag !== undefined) {
          return tag;
        }
      }
    }
  }
  // If no tag came from .map(), fall back to the element enclosing the expression (or owning the attribute)
  const owner = jsxExpression.getFirstAncestor(
    (ancestor) =>
      Node.isJsxElement(ancestor) || Node.isJsxSelfClosingElement(ancestor),
  );
  return owner ? tagNameOf(owner) : undefined;
};

/** Whether the expression contains JSX (such expressions are scanned instead of collapsed into a placeholder) */
const containsJsx = (node: Node): boolean =>
  node.getFirstDescendant(
    (descendant) =>
      Node.isJsxElement(descendant) ||
      Node.isJsxSelfClosingElement(descendant) ||
      Node.isJsxFragment(descendant),
  ) !== undefined;

/** Join merged pieces into one sentence, tidying whitespace around line breaks (<br/>) and at both ends. Also collapses double spaces created at piece boundaries (e.g. {" "} next to JsxText) */
const joinPieces = (pieces: string[]): string =>
  pieces
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();

/**
 * If the element's children are only text, inline elements, and embeddable expressions, join them into one sentence.
 * Returns null when block elements, components, or copy-bearing expressions are mixed in (merge fails). <br /> is kept as a newline.
 */
const mergeInline = (
  element: JsxElement,
  hasCopy: (text: string) => boolean,
): string | null => {
  const pieces: string[] = [];
  for (const child of element.getJsxChildren()) {
    const piece = mergeChild(child, hasCopy);
    if (piece === null) {
      return null;
    }
    pieces.push(piece);
  }
  const text = joinPieces(pieces);
  return text === "" ? null : text;
};

const mergeChild = (
  child: JsxChild,
  hasCopy: (text: string) => boolean,
): string | null => {
  if (Node.isJsxText(child)) {
    // Only collapse whitespace here; joinPieces tidies the edges after joining
    return child.getLiteralText().replace(/\s+/g, " ");
  }
  if (Node.isJsxSelfClosingElement(child)) {
    const tag = child.getTagNameNode().getText();
    return BREAK_TAGS.has(tag) ? "\n" : null;
  }
  if (Node.isJsxElement(child)) {
    const tag = tagNameOf(child);
    if (tag && INLINE_TAGS.has(tag)) {
      return mergeInline(child, hasCopy);
    }
    return null;
  }
  if (Node.isJsxExpression(child)) {
    const expression = child.getExpression();
    if (expression === undefined) {
      return ""; // ignore {/* comments */}
    }
    if (
      Node.isStringLiteral(expression) ||
      Node.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return expression.getLiteralText();
    }
    if (Node.isTemplateExpression(expression)) {
      return templateToText(expression);
    }
    // Expressions without copy are embedded in the sentence as `{expr}` placeholders.
    // Copy-bearing expressions (branching, etc.) and expressions returning JSX are excluded, since collapsing them would lose the copy inside
    if (!containsJsx(expression) && !hasCopy(expression.getText())) {
      return `{${collapseWhitespace(expression.getText())}}`;
    }
    return null;
  }
  return null;
};

type MergedRun = {
  text: string;
  /** Child nodes forming the run (registered as consumed) */
  nodes: JsxChild[];
  /** First visible node, used for the line number and condition detection */
  anchor: JsxChild;
};

/**
 * Join direct children into one sentence per mergeable contiguous span (run).
 * Components, block elements, and copy-bearing expressions act as separators that end a run.
 */
const mergeRuns = (
  container: JsxElement | JsxFragment,
  hasCopy: (text: string) => boolean,
): MergedRun[] => {
  const runs: MergedRun[] = [];
  let nodes: JsxChild[] = [];
  let pieces: string[] = [];
  let anchor: JsxChild | undefined;
  const flush = () => {
    const text = joinPieces(pieces);
    if (text !== "" && anchor !== undefined) {
      runs.push({ text, nodes, anchor });
    }
    nodes = [];
    pieces = [];
    anchor = undefined;
  };
  for (const child of container.getJsxChildren()) {
    const piece = mergeChild(child, hasCopy);
    if (piece === null) {
      flush();
      continue;
    }
    if (anchor === undefined && piece.trim() !== "") {
      anchor = child;
    }
    nodes.push(child);
    pieces.push(piece);
  }
  flush();
  return runs;
};

const classify = (node: Node): Classified => {
  if (node.getKind() === SyntaxKind.JsxText) {
    return { kind: "jsx-text" };
  }

  let current: Node | undefined = node.getParent();
  let previous: Node = node;

  while (current) {
    if (Node.isThrowStatement(current)) {
      return { kind: "internal" };
    }
    if (Node.isCallExpression(current)) {
      const expression = current.getExpression();
      if (isConsoleCall(expression)) {
        return { kind: "internal" };
      }
      // Only when on the argument side of the call (not inside a callback body)
      if (current.getArguments().includes(previous)) {
        return { kind: "call-argument", callee: calleeName(expression) };
      }
    }
    if (Node.isNewExpression(current)) {
      const name = current.getExpression().getText();
      if (name.endsWith("Error")) {
        return { kind: "internal" };
      }
      return { kind: "call-argument", callee: `new ${name}` };
    }
    if (Node.isPropertyAssignment(current)) {
      const key = current.getName();
      const declaration = current.getFirstAncestorByKind(
        SyntaxKind.VariableDeclaration,
      );
      if (declaration?.getName() === "metadata") {
        return { kind: "metadata", key };
      }
      return { kind: "object-property", key };
    }
    // Elements of `const facultyOptions = ["...", ...]` are array-item (key = variable name)
    if (
      Node.isVariableDeclaration(current) &&
      Node.isArrayLiteralExpression(unwrapExpression(previous))
    ) {
      return { kind: "array-item", key: current.getName() };
    }
    if (Node.isJsxAttribute(current)) {
      return { kind: "jsx-attribute", attr: current.getNameNode().getText() };
    }
    if (Node.isJsxExpression(current)) {
      const parent = current.getParent();
      if (
        Node.isJsxElement(parent) ||
        Node.isJsxFragment(parent) ||
        Node.isJsxSelfClosingElement(parent)
      ) {
        return { kind: "jsx-text" };
      }
    }
    // Stop at function boundaries; the context changes beyond them
    if (
      Node.isArrowFunction(current) ||
      Node.isFunctionDeclaration(current) ||
      Node.isFunctionExpression(current) ||
      Node.isMethodDeclaration(current)
    ) {
      break;
    }
    previous = current;
    current = current.getParent();
  }
  return { kind: "other" };
};

const A11Y_ATTRS = new Set(["alt", "title"]);

const isFunctionBoundary = (node: Node): boolean =>
  Node.isArrowFunction(node) ||
  Node.isFunctionDeclaration(node) ||
  Node.isFunctionExpression(node) ||
  Node.isMethodDeclaration(node);

const conditionText = (node: Node): string =>
  collapseWhitespace(node.getText()).slice(0, 60);

type ConditionInfo = { condition: string; branch: "then" | "else" };

/**
 * Detect the nearest branching condition. Applied only when the node is on the A/B side of `cond ? A : B`, or the X side of `cond && X` / `cond || X`.
 * Strings inside the condition expression itself get no condition.
 */
const conditionOf = (node: Node): ConditionInfo | undefined => {
  let previous: Node = node;
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isConditionalExpression(current)) {
      if (current.getWhenTrue() === previous) {
        return {
          condition: conditionText(current.getCondition()),
          branch: "then",
        };
      }
      if (current.getWhenFalse() === previous) {
        return {
          condition: conditionText(current.getCondition()),
          branch: "else",
        };
      }
    }
    if (
      Node.isBinaryExpression(current) &&
      current.getRight() === previous
    ) {
      const operator = current.getOperatorToken().getKind();
      if (operator === SyntaxKind.AmpersandAmpersandToken) {
        return { condition: conditionText(current.getLeft()), branch: "then" };
      }
      if (
        operator === SyntaxKind.BarBarToken ||
        operator === SyntaxKind.QuestionQuestionToken
      ) {
        return { condition: conditionText(current.getLeft()), branch: "else" };
      }
    }
    if (isFunctionBoundary(current)) {
      return undefined;
    }
    previous = current;
    current = current.getParent();
  }
  return undefined;
};

const surfaceFor = (classified: Classified, file: string): Surface => {
  const { kind, attr, key } = classified;
  if (kind === "internal") {
    return "internal";
  }
  if (kind === "metadata") {
    return "meta";
  }
  if (kind === "jsx-attribute" && attr) {
    if (attr.startsWith("aria-") || A11Y_ATTRS.has(attr)) {
      return "a11y";
    }
    if (/error|invalid/i.test(attr)) {
      return "interactive";
    }
    return "visible";
  }
  if (kind === "call-argument") {
    return "interactive";
  }
  if (kind === "object-property") {
    if (
      (key && INTERACTIVE_KEY_PATTERN.test(key)) ||
      INTERACTIVE_FILE_PATTERN.test(basename(file)) ||
      file.includes(`${sep}api${sep}`)
    ) {
      return "interactive";
    }
    return "visible";
  }
  return "visible";
};

/** Normalize Next.js App Router paths into routes; group everything else by directory */
const groupFor = (relativeFile: string, hasAppDir: boolean): string => {
  const parts = relativeFile.split(sep);
  const appIndex = parts.indexOf("app");
  if (hasAppDir && parts[0] === "src" && appIndex === 1) {
    const segments = parts
      .slice(2, -1)
      .filter(
        (segment) =>
          segment !== "_dependencies" &&
          !(segment.startsWith("(") && segment.endsWith(")")),
      );
    return `/${segments.join("/")}`;
  }
  const dirs = parts.slice(0, -1);
  if (dirs[0] === "src") {
    dirs.shift();
  }
  return dirs.slice(0, 2).join("/") || "(root)";
};

/** Test files excluded by default (they never reach the user) */
export const DEFAULT_EXCLUDES = [
  "**/*.{test,spec}.{ts,tsx,js,jsx}",
  "**/__tests__/**",
  "**/__mocks__/**",
];

export type ScanOptions = {
  projectDir: string;
  srcGlob: string;
  /** Extra exclude globs on top of DEFAULT_EXCLUDES (relative to projectDir) */
  exclude?: string[];
};

export const scanProject = (options: ScanOptions): ScanResult => {
  const { projectDir, srcGlob } = options;

  // Inherit the target project's tsconfig when present, enabling module (symbol) resolution for paths aliases like @/*
  const tsConfigFilePath = join(projectDir, "tsconfig.json");
  const project = existsSync(tsConfigFilePath)
    ? new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true })
    : new Project({
        compilerOptions: {
          allowJs: true,
          jsx: ts.JsxEmit.Preserve,
        },
        skipAddingFilesFromTsConfig: true,
      });
  const excludes = [...DEFAULT_EXCLUDES, ...(options.exclude ?? [])];
  const sourceFiles = project.addSourceFilesAtPaths([
    `${projectDir}/${srcGlob}`,
    ...excludes.map((glob) => `!${projectDir}/${glob}`),
  ]);
  const hasAppDir = sourceFiles.some((file) =>
    relative(projectDir, file.getFilePath()).startsWith(`src${sep}app${sep}`),
  );

  // Pre-pass: symbol-resolve identifiers rendered in JSX expressions and link them per declaration.
  // Follows import chains and paths aliases rather than matching by name, so same-named variables never get mislinked
  const renderSites = new Map<string, { tag: string; usedAt: string }>();
  for (const sourceFile of sourceFiles) {
    const relativeFile = relative(projectDir, sourceFile.getFilePath());
    sourceFile.forEachDescendant((node) => {
      if (!Node.isJsxExpression(node)) {
        return;
      }
      const expression = node.getExpression();
      if (expression === undefined) {
        return;
      }
      const identifier = rootIdentifierOf(expression);
      if (identifier === undefined) {
        return;
      }
      const declaration = declarationOf(identifier);
      if (declaration === undefined) {
        return;
      }
      const declKey = declKeyOf(declaration);
      if (renderSites.has(declKey)) {
        return;
      }
      const tag = renderSiteTag(node);
      if (tag !== undefined) {
        renderSites.set(declKey, {
          tag,
          usedAt: `${relativeFile}:${node.getStartLineNumber()}`,
        });
      }
    });
  }

  const entries: StringEntry[] = [];
  for (const sourceFile of sourceFiles) {
    const relativeFile = relative(projectDir, sourceFile.getFilePath());
    const group = groupFor(relativeFile, hasAppDir);
    // Track consumed nodes by position keys, avoiding reliance on wrapper identity
    const consumed = new Set<string>();
    const nodeKey = (node: Node): string =>
      `${node.getPos()}:${node.getEnd()}`;

    const push = (text: string, node: Node, classified: Classified) => {
      if (!detector.isCopy(text, classified)) {
        return;
      }
      // For array-item, look up the render site by declaration key (hits the same ancestor as classify)
      const declaration =
        classified.kind === "array-item"
          ? node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)
          : undefined;
      const rendered = declaration
        ? renderSites.get(declKeyOf(declaration))
        : undefined;
      const tag =
        classified.kind === "jsx-text"
          ? (tagNameOf(node) ?? enclosingTag(node))
          : rendered?.tag;
      // Attributes sort by their owning element's start line (keeps label → placeholder order)
      const owner =
        classified.kind === "jsx-attribute"
          ? (node.getFirstAncestorByKind(SyntaxKind.JsxOpeningElement) ??
            node.getFirstAncestorByKind(SyntaxKind.JsxSelfClosingElement))
          : undefined;
      entries.push({
        text,
        file: relativeFile,
        line: node.getStartLineNumber(),
        group,
        surface: surfaceFor(classified, relativeFile),
        ...classified,
        ...(tag ? { tag } : {}),
        ...(rendered ? { usedAt: rendered.usedAt } : {}),
        ...(owner ? { elementLine: owner.getStartLineNumber() } : {}),
        ...(conditionOf(node) ?? {}),
      });
    };

    sourceFile.forEachDescendant((node) => {
      if (consumed.has(nodeKey(node))) {
        return;
      }
      // Join direct children into one sentence per mergeable contiguous span.
      // Separators (components, block elements, copy-bearing expressions) are not consumed; the ongoing traversal applies the same processing to them recursively
      if (Node.isJsxElement(node) || Node.isJsxFragment(node)) {
        const tag = tagNameOf(node);
        if (tag !== undefined && RAW_TEXT_TAGS.has(tag)) {
          // Always return void; a return value would stop the traversal
          node.forEachDescendant((descendant) => {
            consumed.add(nodeKey(descendant));
          });
          return;
        }
        const runs = mergeRuns(node, detector.hasCopyText);
        const coversAll =
          runs.length === 1 &&
          runs[0]?.nodes.length === node.getJsxChildren().length;
        for (const run of runs) {
          for (const child of run.nodes) {
            consumed.add(nodeKey(child));
            // Always return void; a return value would stop the traversal
            child.forEachDescendant((descendant, traversal) => {
              // Copy in inline-element attributes (title, etc.) is kept as separate entries
              if (Node.isJsxAttribute(descendant)) {
                traversal.skip();
                return;
              }
              consumed.add(nodeKey(descendant));
            });
          }
          push(run.text, coversAll ? node : run.anchor, { kind: "jsx-text" });
        }
        return;
      }
      if (Node.isJsxText(node)) {
        push(collapseWhitespace(node.getLiteralText()), node, classify(node));
        return;
      }
      if (
        Node.isStringLiteral(node) ||
        Node.isNoSubstitutionTemplateLiteral(node)
      ) {
        if (isModuleSpecifier(node) || isDirective(node)) {
          return;
        }
        push(node.getLiteralText(), node, classify(node));
        return;
      }
      if (Node.isTemplateExpression(node)) {
        push(templateToText(node), node, classify(node));
      }
    });
  }

  // Order attributes within an element in natural UI order (label → body → placeholder → extras)
  const attrRank = (entry: StringEntry): number => {
    if (entry.attr === "label" || entry.attr === "legend") {
      return 0;
    }
    if (entry.attr === "placeholder") {
      return 2;
    }
    return entry.attr ? 3 : 1;
  };
  entries.sort(
    (a, b) =>
      a.group.localeCompare(b.group) ||
      a.file.localeCompare(b.file) ||
      (a.elementLine ?? a.line) - (b.elementLine ?? b.line) ||
      attrRank(a) - attrRank(b) ||
      a.line - b.line,
  );

  return {
    projectDir,
    srcGlob,
    scannedFiles: sourceFiles.length,
    generatedAt: new Date().toISOString(),
    entries,
  };
};
