import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface WorkflowStep {
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  env?: Record<string, string>;
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
) as { devDependencies?: Record<string, string>; scripts?: Record<string, string> };

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

  it("validates migrations through a pinned local Supabase database", () => {
    const databaseJob = workflow.jobs?.database;
    const runSteps = getRunSteps(databaseJob);
    const cleanup = databaseJob?.steps?.find((step) => step.run === "pnpm supabase:stop");

    expect(packageJson.devDependencies?.supabase).toMatch(/^\d+\.\d+\.\d+$/);
    expect(databaseJob?.services).toBeUndefined();
    expect(databaseJob?.env?.ALLOW_DATABASE_CLUSTER_MUTATIONS).toBe("true");
    expect(databaseJob?.env?.TEST_DATABASE_URL).toContain("127.0.0.1:54322");
    expect(runSteps).toEqual(
      expect.arrayContaining([
        "pnpm supabase:start",
        "pnpm supabase:schema:check",
        "pnpm supabase:lint",
        "pnpm supabase:test",
        "pnpm test:database",
        "pnpm supabase:stop",
      ]),
    );
    expect(runSteps.indexOf("pnpm supabase:start")).toBeLessThan(
      runSteps.indexOf("pnpm supabase:schema:check"),
    );
    expect(runSteps.indexOf("pnpm supabase:schema:check")).toBeLessThan(
      runSteps.indexOf("pnpm supabase:lint"),
    );
    expect(cleanup?.if).toBe("${{ always() && steps.supabase-start.outcome == 'success' }}");
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
