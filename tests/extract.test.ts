import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DEFAULT_EXCLUDES, scanProject } from "../src/extract.ts";
import type { ScanResult, StringEntry } from "../src/types.ts";
import { makeFixtureProject, removeFixtureProject } from "./helpers/fixture-project.ts";

const APP_ROUTER_FILES: Record<string, string> = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      jsx: "preserve",
      baseUrl: ".",
      paths: { "@/*": ["./src/*"] },
    },
  }),
  "src/app/page.tsx": `"use client";
import { facultyOptions } from "@/lib/options";

export default function Page({ name, count, isOpen, error }: any) {
  return (
    <div>
      <p>Hello <strong>world</strong>, welcome<br />to the site</p>
      <p>You have {count} new messages</p>
      <p>Read the <a href="/terms" title="Opens the terms page">terms</a> first</p>
      <img src="/logo.png" alt="Company logo" className="flex items-center gap-2" />
      <input aria-label="Email address" placeholder="Enter your email" value="未読" />
      <span>{isOpen ? "Close menu" : "Open menu"}</span>
      <span>{error && "Something went wrong"}</span>
      <span>{name || "Anonymous user"}</span>
      <ul>{facultyOptions.map((option) => <li key={option}>{option}</li>)}</ul>
    </div>
  );
}
`,
  "src/lib/options.ts": `export const facultyOptions = ["Literature", "Science"] as const;
`,
  "src/app/(marketing)/about/page.tsx": `export const metadata = { title: "About Us", description: "Learn more about our team" };

export default function AboutPage() {
  return <h2>Meet the team</h2>;
}
`,
  "src/app/api/contact/route.ts": `export async function POST() {
  console.error("Failed to send contact email");
  if (!globalThis.crypto) {
    throw new Error("Missing SMTP configuration");
  }
  return Response.json({ message: "Your message was sent" });
}
`,
  "src/components/button.test.tsx": `export const Excluded = () => <p>Excluded test copy</p>;
`,
  "src/components/__tests__/nav.tsx": `export const Nav = () => <p>Excluded tests dir copy</p>;
`,
  "src/legacy/old.tsx": `export const Old = () => <p>Legacy page copy</p>;
`,
};

describe("scanProject: app-router fixture", () => {
  let dir: string;
  let result: ScanResult;
  const byText = (text: string): StringEntry | undefined =>
    result.entries.find((e) => e.text === text);

  beforeAll(() => {
    dir = makeFixtureProject(APP_ROUTER_FILES);
    result = scanProject({ projectDir: dir, srcGlob: "src/**/*.{ts,tsx,js,jsx}" });
  });
  afterAll(() => removeFixtureProject(dir));

  test("merges JSX text across inline elements and <br>", () => {
    const merged = byText("Hello world, welcome\nto the site");
    expect(merged).toMatchObject({ kind: "jsx-text", tag: "p", surface: "visible", group: "/" });
  });

  test("embeds copy-free expressions as placeholders", () => {
    expect(byText("You have {count} new messages")).toMatchObject({ kind: "jsx-text", tag: "p" });
  });

  test("inline element attributes survive as separate entries", () => {
    expect(byText("Read the terms first")).toMatchObject({ kind: "jsx-text", tag: "p" });
    expect(byText("Opens the terms page")).toMatchObject({
      kind: "jsx-attribute",
      attr: "title",
      surface: "a11y",
    });
  });

  test("classifies attribute surfaces", () => {
    expect(byText("Company logo")).toMatchObject({ attr: "alt", surface: "a11y" });
    expect(byText("Email address")).toMatchObject({ attr: "aria-label", surface: "a11y" });
    expect(byText("Enter your email")).toMatchObject({ attr: "placeholder", surface: "visible" });
  });

  test("drops technical strings", () => {
    for (const absent of [
      "/logo.png",
      "/terms",
      "flex items-center gap-2",
      "use client",
      "@/lib/options",
    ]) {
      expect(byText(absent)).toBeUndefined();
    }
  });

  test("keeps non-Latin values even in technical attributes", () => {
    expect(byText("未読")).toMatchObject({ kind: "jsx-attribute", attr: "value" });
  });

  test("detects branching conditions", () => {
    expect(byText("Close menu")).toMatchObject({ condition: "isOpen", branch: "then", tag: "span" });
    expect(byText("Open menu")).toMatchObject({ condition: "isOpen", branch: "else" });
    expect(byText("Something went wrong")).toMatchObject({ condition: "error", branch: "then" });
    expect(byText("Anonymous user")).toMatchObject({ condition: "name", branch: "else" });
  });

  test("tracks array constants to their render site via @/* alias", () => {
    const item = byText("Literature");
    expect(item).toMatchObject({
      kind: "array-item",
      key: "facultyOptions",
      tag: "li",
      file: "src/lib/options.ts",
      group: "lib",
    });
    expect(item?.usedAt).toMatch(/^src\/app\/page\.tsx:\d+$/);
    expect(byText("Science")).toMatchObject({ kind: "array-item", key: "facultyOptions" });
  });

  test("classifies console/throw strings as internal", () => {
    expect(byText("Failed to send contact email")).toMatchObject({
      kind: "internal",
      surface: "internal",
    });
    expect(byText("Missing SMTP configuration")).toMatchObject({ kind: "internal" });
  });

  test("classifies metadata and api-route strings", () => {
    expect(byText("About Us")).toMatchObject({ kind: "metadata", key: "title", surface: "meta" });
    expect(byText("Learn more about our team")).toMatchObject({ kind: "metadata", surface: "meta" });
    expect(byText("Your message was sent")).toMatchObject({
      kind: "object-property",
      key: "message",
      surface: "interactive",
      group: "/api/contact",
    });
  });

  test("normalizes App Router groups and strips route groups", () => {
    expect(byText("Meet the team")).toMatchObject({ group: "/about", tag: "h2" });
  });

  test("excludes test files by default", () => {
    expect(DEFAULT_EXCLUDES.length).toBeGreaterThan(0);
    expect(byText("Excluded test copy")).toBeUndefined();
    expect(byText("Excluded tests dir copy")).toBeUndefined();
    // page, options, about, route, legacy — test files not counted
    expect(result.scannedFiles).toBe(5);
  });

  test("attributes sort in natural UI order within an element", () => {
    const texts = result.entries.map((e) => e.text);
    expect(texts.indexOf("Enter your email")).toBeLessThan(texts.indexOf("Email address"));
  });

  test("exclude option drops matching files", () => {
    const filtered = scanProject({
      projectDir: dir,
      srcGlob: "src/**/*.{ts,tsx,js,jsx}",
      exclude: ["**/legacy/**"],
    });
    expect(filtered.scannedFiles).toBe(4);
    expect(filtered.entries.find((e) => e.text === "Legacy page copy")).toBeUndefined();
  });
});

describe("scanProject: plain fixture without tsconfig", () => {
  let dir: string;
  let result: ScanResult;

  beforeAll(() => {
    dir = makeFixtureProject({
      "src/index.tsx": `export const Home = () => <p>Root level copy</p>;\n`,
      "src/components/widgets/deep/thing.tsx": `export const Thing = () => <p>Deep widget copy</p>;\n`,
      "src/pages/home.jsx": `export const HomePage = () => <p>JSX fallback copy</p>;\n`,
    });
    result = scanProject({ projectDir: dir, srcGlob: "src/**/*.{ts,tsx,js,jsx}" });
  });
  afterAll(() => removeFixtureProject(dir));

  test("groups top-level files as (root)", () => {
    expect(result.entries.find((e) => e.text === "Root level copy")?.group).toBe("(root)");
  });

  test("groups by the first two directories", () => {
    expect(result.entries.find((e) => e.text === "Deep widget copy")?.group).toBe(
      "components/widgets",
    );
  });

  test("scans .jsx files via the fallback compiler options", () => {
    expect(result.entries.find((e) => e.text === "JSX fallback copy")).toBeDefined();
    expect(result.scannedFiles).toBe(3);
  });
});
