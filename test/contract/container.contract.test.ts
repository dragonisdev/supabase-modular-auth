import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface ComposeService {
  build?: {
    args?: Record<string, string>;
    dockerfile?: string;
  };
  environment?: Record<string, string>;
  ports?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

const readRepositoryFile = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const development = parse(readRepositoryFile("compose.yaml")) as ComposeFile;
const production = parse(readRepositoryFile("compose.production.yaml")) as ComposeFile;
const frontendPackage = JSON.parse(readRepositoryFile("frontend/package.json")) as {
  scripts?: Record<string, string>;
};

describe("container contract", () => {
  it("pins both Node base images to immutable digests", () => {
    for (const dockerfile of ["backend/Dockerfile", "frontend/Dockerfile"]) {
      expect(readRepositoryFile(dockerfile)).toMatch(
        /^FROM node:[^@\s]+@sha256:[0-9a-f]{64} AS base$/m,
      );
    }
  });

  it("keeps development browser traffic on the same-origin proxy", () => {
    expect(development.services?.backend?.ports).toEqual(["127.0.0.1:3000:3000"]);
    expect(development.services?.frontend?.ports).toEqual(["127.0.0.1:3001:3001"]);
    expect(development.services?.frontend?.environment?.FRONTEND_PROXY_TARGET).toBe(
      "http://backend:3000",
    );
    expect(development.services?.frontend?.environment?.NEXT_PUBLIC_API_BASE_URL).toBe("");
  });

  it("uses a collision-free default port while honoring a platform port", () => {
    expect(frontendPackage.scripts?.start).toBe("node scripts/start.mjs");
    expect(readRepositoryFile("frontend/scripts/start.mjs")).toContain(
      'process.env.PORT?.trim() || "3001"',
    );
  });

  it("keeps the production backend private", () => {
    expect(production.services?.backend?.ports).toBeUndefined();
    expect(production.services?.backend?.environment?.TRUST_PROXY).toBeUndefined();
    expect(production.services?.frontend?.ports).toEqual(["127.0.0.1:${FRONTEND_PORT:-3001}:3001"]);
    expect(production.services?.frontend?.build?.args?.FRONTEND_PROXY_TARGET).toBe(
      "http://backend:3000",
    );
  });

  it("does not bake environment files into Docker contexts", () => {
    const dockerignore = readRepositoryFile(".dockerignore");

    expect(dockerignore).toContain("**/.env");
    expect(dockerignore).toContain("**/.env.*");
    expect(dockerignore).toContain("!**/.env.example");
    expect(dockerignore).toContain("**/.npmrc");
    expect(dockerignore).toContain("**/*.key");
    expect(dockerignore).toContain("**/*.pem");
  });
});
