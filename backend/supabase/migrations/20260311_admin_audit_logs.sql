-- Persistent admin audit log table for backend moderation/admin events.
-- Apply this script in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  actor_email text,
  action text not null,
  target_user_id uuid,
  target_email text,
  reason text,
  request_id text,
  ip text,
  user_agent text,
  status text not null check (status in ('success', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_action_created_at_idx
  on public.admin_audit_logs (action, created_at desc);

create index if not exists admin_audit_logs_actor_created_at_idx
  on public.admin_audit_logs (actor_user_id, created_at desc);

create index if not exists admin_audit_logs_target_created_at_idx
  on public.admin_audit_logs (target_user_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

-- No anon/authenticated access; backend service role only.
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant select, insert on public.admin_audit_logs to service_role;

create or replace function public.prevent_admin_audit_logs_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'admin_audit_logs is append-only';
  end if;

  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.audit_retention', true), '') <> 'on' then
      raise exception 'Direct delete is not allowed on admin_audit_logs';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists admin_audit_logs_prevent_mutation on public.admin_audit_logs;
create trigger admin_audit_logs_prevent_mutation
before update or delete on public.admin_audit_logs
for each row execute function public.prevent_admin_audit_logs_mutation();

create or replace function public.admin_purge_audit_logs(p_retention_days integer default 180)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  perform set_config('app.audit_retention', 'on', true);

  delete from public.admin_audit_logs
  where created_at < (now() - make_interval(days => greatest(p_retention_days, 1)));

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.admin_purge_audit_logs(integer) from public, anon, authenticated;
grant execute on function public.admin_purge_audit_logs(integer) to service_role;

<<<<<<< HEAD
-- ENABLE LATER
-- Schedule purge of old audit logs (older than 180 days) every 6 hours, requires pg_cron extension.
-- select cron.schedule(
--   'admin-audit-retention',
--   '0 */6 * * *',
--   $$select public.admin_purge_audit_logs(180);$$
-- );
=======
-- Schedule purge of old audit logs (older than 180 days) every 6 hours, requires pg_cron extension.
select cron.schedule(
  'admin-audit-retention',
  '0 */6 * * *',
  $$select public.admin_purge_audit_logs(180);$$
);
>>>>>>> 4d8d94ca3195c4a411cc651ef866516365a55866
