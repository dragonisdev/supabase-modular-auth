import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const migrationFiles = readdirSync(resolve("backend/supabase/migrations"))
  .filter((file) => file.endsWith(".sql"))
  .toSorted();

describeWithDatabase("Supabase migrations on PostgreSQL", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl });
    await client.connect();

    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin bypassrls;
        end if;
      end
      $$;
    `);
    await client.query("alter role service_role bypassrls");

    await migrationFiles.reduce(async (previousMigration, file) => {
      await previousMigration;
      const sql = readFileSync(resolve("backend/supabase/migrations", file), "utf8");
      await client.query(sql);
      await client.query(sql);
    }, Promise.resolve());
  });

  afterAll(async () => {
    await client?.end();
  });

  it("applies every migration idempotently", async () => {
    const result = await client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_name = 'admin_audit_logs'
    `);

    expect(result.rows).toEqual([{ table_name: "admin_audit_logs" }]);
  });

  it("enables RLS and denies browser roles access to audit logs", async () => {
    const result = await client.query<{
      authenticated_delete: boolean;
      authenticated_insert: boolean;
      authenticated_select: boolean;
      authenticated_update: boolean;
      anon_delete: boolean;
      anon_insert: boolean;
      anon_select: boolean;
      anon_update: boolean;
      rls_enabled: boolean;
      service_insert: boolean;
      service_select: boolean;
    }>(`
      select
        c.relrowsecurity as rls_enabled,
        has_table_privilege('anon', 'public.admin_audit_logs', 'select') as anon_select,
        has_table_privilege('anon', 'public.admin_audit_logs', 'insert') as anon_insert,
        has_table_privilege('anon', 'public.admin_audit_logs', 'update') as anon_update,
        has_table_privilege('anon', 'public.admin_audit_logs', 'delete') as anon_delete,
        has_table_privilege('authenticated', 'public.admin_audit_logs', 'select') as authenticated_select,
        has_table_privilege('authenticated', 'public.admin_audit_logs', 'insert') as authenticated_insert,
        has_table_privilege('authenticated', 'public.admin_audit_logs', 'update') as authenticated_update,
        has_table_privilege('authenticated', 'public.admin_audit_logs', 'delete') as authenticated_delete,
        has_table_privilege('service_role', 'public.admin_audit_logs', 'select') as service_select,
        has_table_privilege('service_role', 'public.admin_audit_logs', 'insert') as service_insert
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'admin_audit_logs'
    `);

    expect(result.rows).toEqual([
      {
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: false,
        authenticated_update: false,
        anon_delete: false,
        anon_insert: false,
        anon_select: false,
        anon_update: false,
        rls_enabled: true,
        service_insert: true,
        service_select: true,
      },
    ]);
  });

  it.each(["anon", "authenticated"])("denies the %s role at query time", async (role) => {
    await client.query(`set role ${role}`);
    try {
      await expect(client.query("select * from public.admin_audit_logs")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await client.query("reset role");
    }
  });

  it("allows the Supabase service role to insert and read", async () => {
    const id = randomUUID();
    await client.query("set role service_role");
    try {
      await client.query(
        `insert into public.admin_audit_logs (id, actor_user_id, action, status)
         values ($1, $2, 'test.service-role', 'success')`,
        [id, randomUUID()],
      );
      const result = await client.query<{ id: string }>(
        "select id from public.admin_audit_logs where id = $1",
        [id],
      );
      expect(result.rows).toEqual([{ id }]);
    } finally {
      await client.query("reset role");
    }
  });

  it("rejects direct audit-log mutation", async () => {
    const id = randomUUID();
    await client.query(
      `insert into public.admin_audit_logs (id, actor_user_id, action, status)
       values ($1, $2, 'test.action', 'success')`,
      [id, randomUUID()],
    );

    await expect(
      client.query("update public.admin_audit_logs set action = 'changed' where id = $1", [id]),
    ).rejects.toThrow(/append-only/i);
    await expect(
      client.query("delete from public.admin_audit_logs where id = $1", [id]),
    ).rejects.toThrow(/direct delete is not allowed/i);
  });

  it("purges only expired audit records through the retention function", async () => {
    const oldId = randomUUID();
    const recentId = randomUUID();
    await client.query(
      `insert into public.admin_audit_logs
         (id, actor_user_id, action, status, created_at)
       values
         ($1, $2, 'test.old', 'success', now() - interval '200 days'),
         ($3, $4, 'test.recent', 'success', now())`,
      [oldId, randomUUID(), recentId, randomUUID()],
    );

    await client.query("set role service_role");
    try {
      const purged = await client.query<{ admin_purge_audit_logs: number }>(
        "select public.admin_purge_audit_logs(180)",
      );
      expect(purged.rows[0]?.admin_purge_audit_logs).toBeGreaterThanOrEqual(1);
    } finally {
      await client.query("reset role");
    }

    const remaining = await client.query<{ id: string }>(
      "select id from public.admin_audit_logs where id = any($1::uuid[]) order by id",
      [[oldId, recentId]],
    );
    expect(remaining.rows).toEqual([{ id: recentId }]);
  });
});
