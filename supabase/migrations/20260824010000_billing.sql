-- Service-role-only Stripe billing projections and durable webhook bookkeeping.

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_customer_id)
);

create table public.billing_subscriptions (
  provider_subscription_id text primary key,
  user_id uuid not null,
  provider_customer_id text not null,
  status text not null check (
    status in (
      'active',
      'canceled',
      'incomplete',
      'incomplete_expired',
      'past_due',
      'paused',
      'trialing',
      'unpaid'
    )
  ),
  price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, provider_customer_id)
    references public.billing_customers(user_id, provider_customer_id)
    on delete cascade
);

create index billing_subscriptions_user_id_idx
  on public.billing_subscriptions (user_id, updated_at desc);

create index billing_subscriptions_customer_id_idx
  on public.billing_subscriptions (provider_customer_id);

create table public.billing_webhook_events (
  provider_event_id text primary key,
  event_type text not null,
  status text not null check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error_code text,
  provider_created_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_webhook_events_status_updated_idx
  on public.billing_webhook_events (status, updated_at);

create or replace function public.set_billing_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_billing_updated_at() from public, anon, authenticated;

create trigger billing_customers_set_updated_at
before update on public.billing_customers
for each row execute function public.set_billing_updated_at();

create trigger billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_billing_updated_at();

create trigger billing_webhook_events_set_updated_at
before update on public.billing_webhook_events
for each row execute function public.set_billing_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;

revoke all on public.billing_customers from public, anon, authenticated, service_role;
revoke all on public.billing_subscriptions from public, anon, authenticated, service_role;
revoke all on public.billing_webhook_events from public, anon, authenticated, service_role;

grant select, insert, update on public.billing_customers to service_role;
grant select, insert, update on public.billing_subscriptions to service_role;
grant select, insert, update on public.billing_webhook_events to service_role;
