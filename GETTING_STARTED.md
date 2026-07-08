# Getting Started

This guide walks through scanning a real project, reading the report, and turning a copy review into applied fixes — using [shadcn/ui](https://github.com/shadcn-ui/ui) as the example throughout.

## 1. Run your first scan

At the root of your React project:

```sh
npx ui-strings scan
```

By default this scans `src/**/*.{ts,tsx,js,jsx}` and writes three files to `./ui-strings-report/`. Point `--src` somewhere else for monorepos or non-standard layouts:

```sh
# Scan one app inside a monorepo and open the report when done
npx ui-strings scan . \
  --src "apps/v4/**/*.{ts,tsx,js,jsx}" \
  --out ./ui-strings-report \
  --open
```

Test files (`*.test.*`, `*.spec.*`, `__tests__/`, `__mocks__/`) are always excluded. Add your own exclusions with `--exclude "**/fixtures/**,**/stories/**"`.

## 2. Read the report

Open `ui-strings-report/ui-strings.html`. Everything is a single self-contained file — share it, attach it to a PR, or drop it on a static host.

<img src="https://raw.githubusercontent.com/junseinagao/ui-strings-scanner/main/assets/report-page-view.png" alt="Page view of the HTML report" />

### Groups

Strings are grouped the way your app is organized. Next.js App Router paths become routes (`/dashboard`, `/examples/playground`); everything else groups by directory (`components/cards`, `registry/bases`). Shared monorepo prefixes like `apps/v4` are stripped automatically. Use the group dropdown to focus on one route at a time.

### Surfaces

Every string is tagged by how it reaches the user. The chips at the top filter by surface:

| Surface       | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `visible`     | Rendered as-is: JSX text, labels, headings                                                   |
| `interactive` | Appears after an action: call arguments (toasts, validation), error/message keys, API routes |
| `a11y`        | Assistive tech only: `aria-*`, `alt`, `title`                                                |
| `meta`        | Next.js `metadata` (page titles, descriptions)                                               |
| `internal`    | Never user-facing: `console.*`, `throw` — hidden unless you pass `--include-internal`        |

### Page view vs Table view

**Page view** lays strings out roughly like the page: headings, body text, then buttons and links with their tag context. It reads like the UI, which makes tone-and-voice review natural.

**Table view** gives one row per string with surface, kind, context, and `file:line` — better for systematic passes. Rows copy out as TSV, so you can paste a slice into a spreadsheet.

<img src="https://raw.githubusercontent.com/junseinagao/ui-strings-scanner/main/assets/report-table-view.png" alt="Table view of the HTML report" />

### Search

The search box matches string text and file names. This is where inconsistencies surface fast — a few real finds from the shadcn/ui scan:

- `Copy Command` and `Copy command` living in the *same file*
- `No results.`, `No results found`, and `No results found.` across 14 files
- One bare `Search` placeholder while every other search field says `Search articles...`, `Search presets...`

## 3. Edit strings and generate a fix prompt

Reviewing is half the job. The report also lets you *fix* what you find without leaving it.

1. Hover a string and click **✎**
2. Type the replacement and **Save** — the report shows ~~old~~ → new, and edits persist in `localStorage` across reloads
3. Repeat until your review pass is done; the bar at the bottom counts your edits

<img src="https://raw.githubusercontent.com/junseinagao/ui-strings-scanner/main/assets/report-table-edit.png" alt="An edited string in Table view showing the old text struck through and the replacement below it" />

Then click **Copy fix prompt**. Every edit becomes one prompt listing exact locations:

```
Update the following UI strings. Target repository: /path/to/your-app
Change only string literals and JSX text. Do not change logic or markup structure.
Each location is given as "file path:line number". ...

1. apps/v4/app/(app)/(root)/page.tsx:58
   Current: Build Your Own
   Replace with: Build Your Own UI
```

Paste it into Claude Code, Cursor, Codex, or any AI coding agent and the changes land on the right literals. **Preview prompt** shows the prompt before copying; **Clear** discards all edits.

Re-run the scan after the agent applies the fixes and the report reflects the new copy — a tight review loop.

## 4. Script it with the JSON output

`ui-strings.json` carries every entry with `text`, `file`, `line`, `kind`, `surface`, `group`, and (when applicable) `condition`/`branch`. A couple of one-liners:

```sh
# All strings that appear after an interaction
jq '.entries[] | select(.surface == "interactive") | .text' ui-strings-report/ui-strings.json

# Count strings per route
jq -r '.entries[].group' ui-strings-report/ui-strings.json | sort | uniq -c | sort -rn
```

Useful in CI too — for example, failing a check when `visible` strings appear outside your i18n layer, or diffing string inventories between releases.

## 5. Where to go next

- [README](README.md) — feature overview and option reference
- [Limitations](README.md#limitations) — what static analysis can and cannot see
- Issues and PRs welcome: <https://github.com/junseinagao/ui-strings-scanner/issues>
