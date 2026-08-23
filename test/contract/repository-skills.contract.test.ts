import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface SkillFrontmatter {
  description?: unknown;
  name?: unknown;
  [key: string]: unknown;
}

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const skillsRoot = resolve(repositoryRoot, ".agents/skills");
const skillNames = ["saas-architecture", "saas-product-delivery", "saas-ui"] as const;
const allowedFrontmatter = new Set(["allowed-tools", "description", "license", "metadata", "name"]);

const readRepositoryFile = (path: string): string =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

const readFrontmatter = (skillName: string): SkillFrontmatter => {
  const markdown = readRepositoryFile(`.agents/skills/${skillName}/SKILL.md`);
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  expect(match, `${skillName} must start with YAML frontmatter`).not.toBeNull();
  return parse(match?.[1] ?? "") as SkillFrontmatter;
};

describe("repository-local skill contract", () => {
  it("keeps the reviewed skill set explicit", () => {
    const directories = readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();

    expect(directories).toEqual(skillNames);
  });

  it.each(skillNames)("keeps %s valid and complete", (skillName) => {
    const markdown = readRepositoryFile(`.agents/skills/${skillName}/SKILL.md`);
    const frontmatter = readFrontmatter(skillName);

    expect(frontmatter.name).toBe(skillName);
    expect(typeof frontmatter.description).toBe("string");
    expect(String(frontmatter.description).length).toBeGreaterThan(80);
    expect(String(frontmatter.description)).toMatch(/\buse\b/i);
    expect(String(frontmatter.description)).toMatch(/\bdo not use\b/i);
    expect(Object.keys(frontmatter).every((key) => allowedFrontmatter.has(key))).toBe(true);
    expect(markdown).not.toMatch(/\[?TODO:?|PLACEHOLDER/i);
  });

  it("routes every local skill through AGENTS.md", () => {
    const agents = readRepositoryFile("AGENTS.md");

    for (const skillName of skillNames) {
      expect(agents).toContain(`.agents/skills/${skillName}/SKILL.md`);
    }

    expect(agents).toContain("read its complete `SKILL.md` before taking task actions");
    expect(agents).toContain("requires the user's explicit approval");
  });

  it("documents native discovery and the authorization boundary", () => {
    const agents = readRepositoryFile("AGENTS.md");

    expect(agents).toContain("GitHub Copilot Agent mode");
    expect(agents).toContain("discover them automatically");
    expect(agents).toContain("do not broaden authorization");
    expect(agents).toContain("requires the user's explicit approval");
  });
});
