import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const ignoredDirectories = new Set([
  ".agents",
  ".codex",
  ".git",
  ".next",
  ".pnpm-store",
  ".stryker-tmp",
  "coverage",
  "dist",
  "node_modules",
]);

const collectMarkdown = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectMarkdown(path);
    }

    return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? [path] : [];
  });

const markdownFiles = collectMarkdown(repositoryRoot);

describe("documentation contract", () => {
  it("resolves every relative Markdown link", () => {
    const broken: string[] = [];
    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

    for (const file of markdownFiles) {
      const markdown = readFileSync(file, "utf8");

      for (const match of markdown.matchAll(linkPattern)) {
        const target = match[1]?.trim().replace(/^<|>$/g, "");

        if (!target || /^(?:https?:|mailto:|#)/.test(target)) {
          continue;
        }

        const path = decodeURIComponent(target.split("#", 1)[0] ?? "");
        if (path && !existsSync(resolve(dirname(file), path))) {
          broken.push(`${file}: ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
