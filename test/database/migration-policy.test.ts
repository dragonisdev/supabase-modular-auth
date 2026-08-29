import { describe, expect, it } from "vitest";

import { migrationFiles } from "../helpers/database-files.js";

interface SqlMigration {
  file: string;
  sql: string;
}

const sqlIdentifier = "[a-z_][a-z0-9_]*";
const publicTableCapture = String.raw`(?:"public"|public)\s*\.\s*(?:"(${sqlIdentifier})"|(${sqlIdentifier}))`;

const normalizeSql = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const publicTableReference = (table: string): string =>
  String.raw`(?:"public"|public)\s*\.\s*(?:"${table}"|${table})`;

const findMissingRls = (migrations: readonly SqlMigration[]): string[] => {
  const missingRls: string[] = [];
  const createTablePattern = new RegExp(
    String.raw`create table(?: if not exists)?\s+${publicTableCapture}`,
    "g",
  );

  for (const migration of migrations) {
    const sql = normalizeSql(migration.sql);
    const createdTables = [...sql.matchAll(createTablePattern)].map(
      (match) => match[1] ?? match[2],
    );

    for (const table of createdTables) {
      if (
        !new RegExp(
          String.raw`alter table(?: if exists)?\s+(?:only\s+)?${publicTableReference(table)}\s+enable row level security`,
        ).test(sql)
      ) {
        missingRls.push(`${migration.file}:public.${table}`);
      }
    }
  }

  return missingRls;
};

const findMissingTenantPolicy = (migrations: readonly SqlMigration[]): string[] => {
  const missingTenantPolicy: string[] = [];
  const createTablePattern = new RegExp(
    String.raw`create table(?: if not exists)?\s+${publicTableCapture}\s*\((.*?)\);`,
    "g",
  );

  for (const migration of migrations) {
    const sql = normalizeSql(migration.sql);
    const tableDefinitions = [...sql.matchAll(createTablePattern)];

    for (const match of tableDefinitions) {
      const table = match[1] ?? match[2];
      const definition = match[3] ?? "";

      if (!definition.includes("tenant_id")) {
        continue;
      }

      const tableReference = publicTableReference(table);
      const hasRls = new RegExp(
        String.raw`alter table(?: if exists)?\s+(?:only\s+)?${tableReference}\s+enable row level security`,
      ).test(sql);
      const tenantPolicies = [
        ...sql.matchAll(
          new RegExp(String.raw`create policy [^;]+ on\s+${tableReference}[^;]*;`, "g"),
        ),
      ];
      const hasPolicy = tenantPolicies.some((policy) => policy[0].includes("tenant_id"));

      if (!hasRls || !hasPolicy) {
        missingTenantPolicy.push(`${migration.file}:public.${table}`);
      }
    }
  }

  return missingTenantPolicy;
};

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
    expect(findMissingRls(migrationFiles)).toEqual([]);
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
    expect(findMissingTenantPolicy(migrationFiles)).toEqual([]);
  });

  it("checks quoted Supabase-generated table identifiers", () => {
    const missingRls: SqlMigration[] = [
      {
        file: "20260829000000_missing_rls.sql",
        sql: `create table "public"."projects" (
          "id" uuid primary key,
          "tenant_id" uuid not null
        );`,
      },
    ];
    const missingPolicy: SqlMigration[] = [
      {
        file: "20260829000001_missing_policy.sql",
        sql: `create table "public"."projects" (
          "id" uuid primary key,
          "tenant_id" uuid not null
        );
        alter table "public"."projects" enable row level security;`,
      },
    ];
    const protectedTable: SqlMigration[] = [
      {
        file: "20260829000002_protected.sql",
        sql: `create table "public"."projects" (
          "id" uuid primary key,
          "tenant_id" uuid not null
        );
        alter table "public"."projects" enable row level security;
        create policy "tenant isolation"
          on "public"."projects"
          using ("tenant_id" = auth.uid());`,
      },
    ];

    expect(findMissingRls(missingRls)).toEqual(["20260829000000_missing_rls.sql:public.projects"]);
    expect(findMissingTenantPolicy(missingPolicy)).toEqual([
      "20260829000001_missing_policy.sql:public.projects",
    ]);
    expect(findMissingRls(protectedTable)).toEqual([]);
    expect(findMissingTenantPolicy(protectedTable)).toEqual([]);
  });
});
