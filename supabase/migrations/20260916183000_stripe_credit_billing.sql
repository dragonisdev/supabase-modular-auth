-- Stripe customer mapping and append-only credit entitlements.

create table public.billing_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (entry_type in ('purchase', 'usage', 'refund', 'adjustment')),
  credit_delta integer not null check (credit_delta <> 0),
  stripe_event_id text unique,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_price_id text,
  amount_total bigint check (amount_total >= 0),
  currency text check (currency ~ '^[a-z]{3}$'),
  created_at timestamptz not null default now(),
  constraint billing_credit_ledger_purchase_fields check (
    entry_type <> 'purchase'
    or (
      credit_delta > 0
      and stripe_event_id is not null
      and stripe_checkout_session_id is not null
      and stripe_payment_intent_id is not null
      and stripe_price_id is not null
      and amount_total is not null
      and currency is not null
    )
  )
);

create index billing_credit_ledger_user_created_at_idx
  on public.billing_credit_ledger (user_id, created_at desc);

alter table public.billing_accounts enable row level security;
alter table public.billing_credit_ledger enable row level security;

revoke all on public.billing_accounts from public, anon, authenticated, service_role;
revoke all on public.billing_credit_ledger from public, anon, authenticated, service_role;
revoke all on sequence public.billing_credit_ledger_id_seq
  from public, anon, authenticated, service_role;
grant select, insert, update on public.billing_accounts to service_role;
grant select, insert on public.billing_credit_ledger to service_role;
grant usage, select on sequence public.billing_credit_ledger_id_seq to service_role;

create function public.get_billing_credit_balance(p_user_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(credit_delta), 0)::bigint
  from public.billing_credit_ledger
  where user_id = p_user_id;
$$;

revoke all on function public.get_billing_credit_balance(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_billing_credit_balance(uuid) to service_role;

create function public.fulfill_stripe_credit_purchase(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_event_id text,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_stripe_price_id text,
  p_amount_total bigint,
  p_currency text,
  p_credit_amount integer
)
returns table (applied boolean, balance bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  account_rows integer := 0;
  ledger_rows integer := 0;
begin
  if p_credit_amount <= 0 then
    raise exception 'credit purchase amount must be positive';
  end if;

  insert into public.billing_accounts (user_id, stripe_customer_id)
  values (p_user_id, p_stripe_customer_id)
  on conflict (user_id) do update
    set updated_at = now()
    where billing_accounts.stripe_customer_id = excluded.stripe_customer_id;

  get diagnostics account_rows = row_count;
  if account_rows <> 1 then
    raise exception 'billing account customer mismatch';
  end if;

  insert into public.billing_credit_ledger (
    user_id,
    entry_type,
    credit_delta,
    stripe_event_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    stripe_price_id,
    amount_total,
    currency
  )
  values (
    p_user_id,
    'purchase',
    p_credit_amount,
    p_stripe_event_id,
    p_stripe_session_id,
    p_stripe_payment_intent_id,
    p_stripe_price_id,
    p_amount_total,
    lower(p_currency)
  )
  on conflict do nothing;

  get diagnostics ledger_rows = row_count;
  if ledger_rows = 0 and not exists (
    select 1
    from public.billing_credit_ledger
    where user_id = p_user_id
      and entry_type = 'purchase'
      and stripe_checkout_session_id = p_stripe_session_id
      and stripe_payment_intent_id = p_stripe_payment_intent_id
      and stripe_price_id = p_stripe_price_id
      and amount_total = p_amount_total
      and currency = lower(p_currency)
      and credit_delta = p_credit_amount
  ) then
    raise exception 'billing fulfillment idempotency conflict';
  end if;

  return query
  select
    ledger_rows = 1,
    public.get_billing_credit_balance(p_user_id);
end;
$$;

revoke all on function public.fulfill_stripe_credit_purchase(
  uuid, text, text, text, text, text, bigint, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.fulfill_stripe_credit_purchase(
  uuid, text, text, text, text, text, bigint, text, integer
) to service_role;
