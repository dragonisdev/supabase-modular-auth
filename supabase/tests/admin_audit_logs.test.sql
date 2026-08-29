begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select ok(
  to_regclass('public.admin_audit_logs') is not null,
  'admin audit log table exists'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_audit_logs'::regclass),
  'admin audit log table has RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.admin_audit_logs', 'select'),
  'anon cannot read audit logs'
);

select ok(
  not has_table_privilege('anon', 'public.admin_audit_logs', 'insert'),
  'anon cannot append audit logs'
);

select ok(
  not has_table_privilege('anon', 'public.admin_audit_logs', 'update'),
  'anon cannot update audit logs'
);

select ok(
  not has_table_privilege('anon', 'public.admin_audit_logs', 'delete'),
  'anon cannot delete audit logs'
);

select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_logs', 'select'),
  'authenticated users cannot read audit logs'
);

select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_logs', 'insert'),
  'authenticated users cannot append audit logs'
);

select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_logs', 'update'),
  'authenticated users cannot update audit logs'
);

select ok(
  not has_table_privilege('authenticated', 'public.admin_audit_logs', 'delete'),
  'authenticated users cannot delete audit logs'
);

select ok(
  has_table_privilege('service_role', 'public.admin_audit_logs', 'select'),
  'service role can read audit logs'
);

select ok(
  has_table_privilege('service_role', 'public.admin_audit_logs', 'insert'),
  'service role can append audit logs'
);

select ok(
  not has_table_privilege('service_role', 'public.admin_audit_logs', 'update'),
  'service role cannot update audit logs'
);

select ok(
  not has_table_privilege('service_role', 'public.admin_audit_logs', 'delete'),
  'service role cannot delete audit logs directly'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.admin_purge_audit_logs(integer)'::regprocedure
      and prosecdef
  ),
  'retention function is security definer'
);

select ok(
  exists (
    select 1
    from pg_proc
    where oid = 'public.admin_purge_audit_logs(integer)'::regprocedure
      and 'search_path=public' = any(proconfig)
  ),
  'retention function fixes its search path'
);

select ok(
  not has_function_privilege('anon', 'public.admin_purge_audit_logs(integer)', 'execute'),
  'anon cannot run retention'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.admin_purge_audit_logs(integer)',
    'execute'
  ),
  'authenticated users cannot run retention'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.admin_purge_audit_logs(integer)',
    'execute'
  ),
  'service role can run retention'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.prevent_admin_audit_logs_mutation()',
    'execute'
  ),
  'anon cannot execute the audit trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.prevent_admin_audit_logs_mutation()',
    'execute'
  ),
  'authenticated users cannot execute the audit trigger function'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.admin_audit_logs'::regclass
      and tgname = 'admin_audit_logs_prevent_mutation'
      and tgenabled = 'O'
      and not tgisinternal
  ),
  'append-only trigger is enabled'
);

select * from finish();

rollback;
