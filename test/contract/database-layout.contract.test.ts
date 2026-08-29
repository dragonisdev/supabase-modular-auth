import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { repositoryRoot, supabaseRoot } from "../helpers/database-files.js";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".temp",
  "coverage",
  "dist",
  "node_modules",
]);

const collectSqlFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectSqlFiles(path);
    }

    return entry.isFile() && entry.name.endsWith(".sql") ? [path] : [];
  });

const repositorySqlFiles = collectSqlFiles(repositoryRoot).map((path) =>
  relative(repositoryRoot, path).replaceAll("\\", "/"),
);

const readSupabaseFile = (path: string): string =>
  readFileSync(resolve(supabaseRoot, path), "utf8");

describe("database layout contract", () => {
  it("keeps database workflow SQL in the canonical Supabase tree", () => {
    expect(repositorySqlFiles).toEqual(
      expect.arrayContaining([
        "supabase/queries/admin/inspect_user_metadata.sql",
        "supabase/queries/admin/promote_user_to_admin.sql",
        "supabase/migrations/20260311000000_admin_audit_logs.sql",
        "supabase/schemas/admin_audit_logs.sql",
        "supabase/tests/admin_audit_logs.test.sql",
      ]),
    );
    expect(repositorySqlFiles.every((path) => path.startsWith("supabase/"))).toBe(true);
  });

  it("keeps admin operator queries free of live identifiers", () => {
    for (const path of [
      "queries/admin/inspect_user_metadata.sql",
      "queries/admin/promote_user_to_admin.sql",
    ]) {
      expect(readSupabaseFile(path)).not.toMatch(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
      );
    }
  });

  it("makes the admin promotion query fail closed", () => {
    const query = readSupabaseFile("queries/admin/promote_user_to_admin.sql").toLowerCase();

    expect(query).toContain("target_user_id uuid := null::uuid");
    expect(query).toContain("coalesce(raw_app_meta_data, '{}'::jsonb)");
    expect(query).toContain("jsonb_build_object('role', 'admin', 'is_admin', true)");
    expect(query).toContain("get diagnostics affected_rows = row_count");
    expect(query).toContain("if affected_rows <> 1");
    expect(query).toContain("raise exception");
  });

  it("keeps local Supabase configuration aligned with application auth", () => {
    const config = readSupabaseFile("config.toml");

    expect(config).toContain('project_id = "supabase-saas-starter"');
    expect(config).toContain('schema_paths = ["./schemas/*.sql"]');
    expect(config).toContain('site_url = "http://localhost:3001"');
    expect(config).toMatch(/\[db\.seed\][\s\S]*?enabled = false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_confirmations = true/);
  });

  it("declares the current audit-log security contract as desired state", () => {
    const schema = readSupabaseFile("schemas/admin_audit_logs.sql").toLowerCase();

    expect(schema).toContain("create table public.admin_audit_logs");
    expect(schema).toContain("enable row level security");
    expect(schema).toContain(
      "revoke all on public.admin_audit_logs from public, anon, authenticated, service_role",
    );
    expect(schema).toContain("grant select, insert on public.admin_audit_logs to service_role");
    expect(schema).toContain("create trigger admin_audit_logs_prevent_mutation");
    expect(schema).toContain("security definer");
    expect(schema).toContain("set search_path = public");
  });
});
