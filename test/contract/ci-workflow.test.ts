import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface WorkflowStep {
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  services?: Record<string, { image?: string }>;
  steps?: WorkflowStep[];
}

interface Workflow {
  jobs?: Record<string, WorkflowJob>;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
}

const workflow = parse(
  readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
) as Workflow;
const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

const getRunSteps = (job: WorkflowJob | undefined): string[] =>
  job?.steps?.flatMap((step) => (step.run ? [step.run] : [])) ?? [];

const getActionSteps = (job: WorkflowJob | undefined): string[] =>
  job?.steps?.flatMap((step) => (step.uses ? [step.uses] : [])) ?? [];

describe("CI workflow contract", () => {
  it("uses read-only repository permissions and safe triggers", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on).toHaveProperty("push");
    expect(workflow.on).not.toHaveProperty("pull_request_target");
  });

  it("runs every local quality gate", () => {
    expect(getRunSteps(workflow.jobs?.quality)).toEqual(
      expect.arrayContaining([
        "pnpm install --frozen-lockfile",
        "pnpm format:check",
        "pnpm lint",
        "pnpm type-check",
        "pnpm test:type-check",
        "pnpm api:check",
        "pnpm compose:check",
        "pnpm test:coverage",
        "pnpm build",
      ]),
    );
  });

  it("builds shared declarations before checking workspace consumers", () => {
    expect(packageJson.scripts?.["type-check"]).toMatch(/^pnpm --filter types build && /);
  });

  it("pins third-party actions to immutable commit SHAs", () => {
    const actions = Object.values(workflow.jobs ?? {}).flatMap(getActionSteps);

    expect(actions).not.toHaveLength(0);
    expect(actions.every((action) => /@[0-9a-f]{40}$/.test(action))).toBe(true);
  });

  it("does not persist checkout credentials", () => {
    const checkoutSteps = Object.values(workflow.jobs ?? {}).flatMap(
      (job) => job.steps?.filter((step) => step.uses?.startsWith("actions/checkout@")) ?? [],
    );

    expect(checkoutSteps).not.toHaveLength(0);
    expect(checkoutSteps.every((step) => step.with?.["persist-credentials"] === false)).toBe(true);
  });

  it("runs migration and RLS tests against disposable PostgreSQL", () => {
    expect(workflow.jobs?.database?.services?.postgres?.image).toMatch(
      /^postgres:[^@]+@sha256:[0-9a-f]{64}$/,
    );
    expect(getRunSteps(workflow.jobs?.database)).toContain("pnpm test:database");
  });

  it("builds both production container images", () => {
    expect(getRunSteps(workflow.jobs?.containers)).toEqual(
      expect.arrayContaining([
        "docker build --file backend/Dockerfile --tag supabase-saas-backend:ci .",
        "docker build --file frontend/Dockerfile --tag supabase-saas-frontend:ci .",
      ]),
    );
  });
});
