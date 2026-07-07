import type { ScanResult, StringEntry } from "./types.ts";

const escapeCell = (text: string): string =>
  text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

const countBy = <T extends string>(
  entries: StringEntry[],
  keyOf: (entry: StringEntry) => T,
): Map<T, number> => {
  const counts = new Map<T, number>();
  for (const entry of entries) {
    const key = keyOf(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const contextOf = (entry: StringEntry): string => {
  const parts: string[] = [];
  if (entry.kind === "array-item" && entry.key) {
    parts.push(
      entry.tag
        ? `\`${entry.key}\` → \`<${entry.tag}>\``
        : `\`${entry.key}\``,
    );
  } else if (entry.attr) {
    parts.push(`\`${entry.attr}=\``);
  } else if (entry.callee) {
    parts.push(`\`${entry.callee}()\``);
  } else if (entry.key) {
    parts.push(`\`${entry.key}:\``);
  } else if (entry.tag) {
    parts.push(`\`<${entry.tag}>\``);
  }
  if (entry.condition) {
    const negated =
      entry.branch === "else" ? `!(${entry.condition})` : entry.condition;
    parts.push(`cond: \`${negated}\``);
  }
  return parts.join(" ");
};

export const renderMarkdown = (
  result: ScanResult,
  visibleEntries: StringEntry[],
): string => {
  const lines: string[] = [];
  lines.push("# UI Strings");
  lines.push("");
  lines.push(`- Target: \`${result.projectDir}\` (\`${result.srcGlob}\`)`);
  lines.push(`- Generated: ${result.generatedAt}`);
  lines.push(
    `- Strings: **${visibleEntries.length}** / Files scanned: ${result.scannedFiles}`,
  );
  lines.push("");

  lines.push("## Count by surface");
  lines.push("");
  lines.push("| surface | count |");
  lines.push("| --- | ---: |");
  const surfaceCounts = countBy(visibleEntries, (entry) => entry.surface);
  for (const [surface, count] of [...surfaceCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`| \`${surface}\` | ${count} |`);
  }
  lines.push("");

  lines.push("## Count by kind");
  lines.push("");
  lines.push("| kind | count |");
  lines.push("| --- | ---: |");
  const kindCounts = countBy(visibleEntries, (entry) => entry.kind);
  for (const [kind, count] of [...kindCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`| \`${kind}\` | ${count} |`);
  }
  lines.push("");

  lines.push("## Count by group");
  lines.push("");
  lines.push("| group | count |");
  lines.push("| --- | ---: |");
  const groupCounts = countBy(visibleEntries, (entry) => entry.group);
  for (const [group, count] of [...groupCounts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push(`| ${group} | ${count} |`);
  }
  lines.push("");

  lines.push("## All strings");
  let currentGroup = "";
  let currentFile = "";
  for (const entry of visibleEntries) {
    if (entry.group !== currentGroup) {
      currentGroup = entry.group;
      currentFile = "";
      lines.push("");
      lines.push(`### ${currentGroup}`);
    }
    if (entry.file !== currentFile) {
      currentFile = entry.file;
      lines.push("");
      lines.push(`#### ${currentFile}`);
      lines.push("");
      lines.push("| line | surface | context | text |");
      lines.push("| ---: | --- | --- | --- |");
    }
    lines.push(
      `| ${entry.line} | \`${entry.surface}\` | ${contextOf(entry)} | ${escapeCell(entry.text)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
};
