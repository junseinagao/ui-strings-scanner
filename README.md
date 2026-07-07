<div align="center">
  <img src="https://raw.githubusercontent.com/junseinagao/ui-strings-scanner/main/assets/hero.png" width="1200" alt="UI Strings Scanner" />
</div>

<hr />

<div align="center">

[![npm version](https://img.shields.io/npm/v/ui-strings)](https://www.npmjs.com/package/ui-strings)
[![npm downloads](https://img.shields.io/npm/dm/ui-strings)](https://www.npmjs.com/package/ui-strings)
[![node version](https://img.shields.io/node/v/ui-strings)](https://www.npmjs.com/package/ui-strings)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

# UI Strings Scanner

UI Strings Scanner lists every string that could reach the user in a React (JSX/TSX) codebase, without running the code. It parses the AST with [ts-morph](https://ts-morph.com/), so it works on any React project with one command: no build, no mocks, no runtime. Detection is built on JSX semantics, so it is React-only.

Use it to audit hardcoded copy, review tone and wording, catch untranslated strings, or take stock before adopting i18n. It inventories strings; translation-key management is out of scope.

## Quick Start

Run it at the root of your React project:

```sh
npx ui-strings scan
```

```
Scanning: /path/to/my-app/src/**/*.{ts,tsx,js,jsx}

214 strings (+18 internal) / 52 files scanned
  visible      163
  interactive  31
  internal     18
  a11y         14
  meta         6

→ /path/to/my-app/ui-strings-report/ui-strings.json
→ /path/to/my-app/ui-strings-report/ui-strings.md
→ /path/to/my-app/ui-strings-report/ui-strings.html
```

## Features

- **Sentence-level extraction** - `<p>Hello <b>world</b>,<br />welcome</p>` comes out as one string. Embedded expressions become `{count}` placeholders.
- **Condition tracking** - Strings inside `cond ? A : B` or `cond && X` carry their condition, so you know when they show.
- **Symbol resolution** - An option array rendered with `.map()` links back to its declaration, across import chains and `@/` aliases.
- **Surface classification** - Every string is tagged by how it reaches the user: `visible`, `interactive`, `a11y`, `meta`, or `internal`.
- **Noise filtering** - Class names, import paths, and directives never make the list. Structural rules combine with lexical shape, and non-Latin text always counts as copy, so mixed-language projects work.
- **Next.js aware** - Entries group by App Router route, and `metadata` is classified as `meta`.
- **Fix prompts** - Edit strings in the HTML viewer, then copy all edits as a ready-to-run prompt for an AI coding agent.

## Usage

```sh
npx ui-strings scan [projectDir] [options]
```

`projectDir` defaults to the current directory.

| Option               | Default                    | Description                                                                                                    |
| -------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `--src <glob>`       | `src/**/*.{ts,tsx,js,jsx}` | files to scan (relative to projectDir)                                                                         |
| `--exclude <globs>`  | none                       | extra exclude globs, comma-separated (`*.test.*` / `*.spec.*` / `__tests__` / `__mocks__` are always excluded) |
| `--out <dir>`        | `./ui-strings-report`      | output directory                                                                                               |
| `--format <list>`    | `json,md,html`             | output formats                                                                                                 |
| `--include-internal` | off                        | include console/throw strings in the Markdown listing                                                          |
| `--open`             | off                        | open the HTML report in a browser                                                                              |

The scanner reads the target project's `tsconfig.json` when present and resolves path aliases such as `@/*` through it.

## Output

- `ui-strings.json` - every entry with `text`, `file`, `line`, `kind`, `surface`, and `condition`
- `ui-strings.md` - counts by surface, kind, and group, plus the full listing
- `ui-strings.html` - single-file viewer with search, filters, TSV row copy, and inline editing

## Limitations

Static analysis has limits. Strings built at runtime, such as API responses and computed values, stay invisible. Copy passed across components is captured at its declaration, and only the array `.map()` pattern resolves to a render site. Unknown copy attributes fall back to lexical detection.

## Development

The published CLI runs on Node. Development uses [Bun](https://bun.sh).

```sh
bun install
bun test
bun run typecheck
bun run build   # bundle dist/cli.js
```

## Contributing

Issues and pull requests are welcome.

## License

[MIT](LICENSE)

## Author

Junsei Nagao <https://github.com/junseinagao>
