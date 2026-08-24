import { describe, expect, it } from "vitest";

import { migrationFiles } from "../helpers/database-files.js";

const normalizeSql = (sql: string): string =>
  sql.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim().toLowerCase();

describe("Supabase migration policy", () => {
  it("has at least one versioned migration", () => {
    expect(migrationFiles).not.toHaveLength(0);
    expect(
      migrationFiles.every((migration) =>
        /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.test(migration.file),
      ),
    ).toBe(true);
    expect(new Set(migrationFiles.map((migration) => migration.version)).size).toBe(
      migrationFiles.length,
    );
  });

  it("enables RLS for every public table created by a migration", () => {
    const missingRls: string[] = [];

    for (const migration of migrationFiles) {
      const sql = normalizeSql(migration.sql);
      const createdTables = [
        ...sql.matchAll(/create table(?: if not exists)? public\.([a-z_][a-z0-9_]*)/g),
      ].map((match) => match[1]);

      for (const table of createdTables) {
        if (!sql.includes(`alter table public.${table} enable row level security`)) {
          missingRls.push(`${migration.file}:public.${table}`);
        }
      }
    }

    expect(missingRls).toEqual([]);
  });

  it("keeps the audit log service-role-only and append-only", () => {
    const auditMigration = migrationFiles.find((migration) =>
      migration.sql.includes("public.admin_audit_logs"),
    );

    expect(auditMigration, "admin_audit_logs migration is missing").toBeDefined();

    const sql = normalizeSql(auditMigration?.sql ?? "");
    expect(sql).toContain(
      "revoke all on public.admin_audit_logs from public, anon, authenticated, service_role",
    );
    expect(sql).toContain("grant select, insert on public.admin_audit_logs to service_role");
    expect(sql).toContain("before update or delete on public.admin_audit_logs");
    expect(sql).toContain("raise exception 'admin_audit_logs is append-only'");
    expect(sql).toContain("security definer");
    expect(sql).toContain(
      "revoke all on function public.prevent_admin_audit_logs_mutation() from public, anon, authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.admin_purge_audit_logs(integer) from public, anon, authenticated",
    );
  });

  it("requires tenant-owned tables to declare both RLS and a policy", () => {
    const missingTenantPolicy: string[] = [];

    for (const migration of migrationFiles) {
      const sql = normalizeSql(migration.sql);
      const tableDefinitions = [
        ...sql.matchAll(/create table(?: if not exists)? public\.([a-z_][a-z0-9_]*)\s*\((.*?)\);/g),
      ];

      for (const [, table, definition] of tableDefinitions) {
        if (!definition.includes("tenant_id")) {
          continue;
        }

        const hasRls = sql.includes(`alter table public.${table} enable row level security`);
        const tenantPolicies = [
          ...sql.matchAll(new RegExp(`create policy [^;]+ on public\\.${table}[^;]*;`, "g")),
        ];
        const hasPolicy = tenantPolicies.some((policy) => policy[0].includes("tenant_id"));

        if (!hasRls || !hasPolicy) {
          missingTenantPolicy.push(`${migration.file}:public.${table}`);
        }
      }
    }

    expect(missingTenantPolicy).toEqual([]);
  });
});
