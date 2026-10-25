begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

select has_table('public', 'billing_accounts', 'billing accounts table exists');
select has_table('public', 'billing_credit_ledger', 'billing credit ledger exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.billing_accounts'::regclass),
  'billing accounts has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.billing_credit_ledger'::regclass),
  'billing credit ledger has RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.billing_accounts', 'select'), 'anon cannot read billing accounts');
select ok(not has_table_privilege('anon', 'public.billing_accounts', 'insert'), 'anon cannot create billing accounts');
select ok(not has_table_privilege('authenticated', 'public.billing_accounts', 'select'), 'authenticated cannot read billing accounts');
select ok(not has_table_privilege('authenticated', 'public.billing_accounts', 'insert'), 'authenticated cannot create billing accounts');
select ok(not has_table_privilege('anon', 'public.billing_credit_ledger', 'select'), 'anon cannot read credits');
select ok(not has_table_privilege('anon', 'public.billing_credit_ledger', 'insert'), 'anon cannot grant credits');
select ok(not has_table_privilege('authenticated', 'public.billing_credit_ledger', 'select'), 'authenticated cannot read credits directly');
select ok(not has_table_privilege('authenticated', 'public.billing_credit_ledger', 'insert'), 'authenticated cannot grant credits');

select ok(has_table_privilege('service_role', 'public.billing_accounts', 'select'), 'service role can read billing accounts');
select ok(has_table_privilege('service_role', 'public.billing_accounts', 'insert'), 'service role can create billing accounts');
select ok(has_table_privilege('service_role', 'public.billing_credit_ledger', 'select'), 'service role can read credits');
select ok(has_table_privilege('service_role', 'public.billing_credit_ledger', 'insert'), 'service role can grant credits');
select ok(not has_table_privilege('service_role', 'public.billing_credit_ledger', 'update'), 'service role cannot edit credits');
select ok(not has_table_privilege('service_role', 'public.billing_credit_ledger', 'delete'), 'service role cannot delete credits');
select ok(has_sequence_privilege('service_role', 'public.billing_credit_ledger_id_seq', 'usage'), 'service role can allocate ledger IDs');

select ok(not has_function_privilege('anon', 'public.get_billing_credit_balance(uuid)', 'execute'), 'anon cannot query balance RPC');
select ok(not has_function_privilege('authenticated', 'public.get_billing_credit_balance(uuid)', 'execute'), 'authenticated cannot query balance RPC');
select ok(has_function_privilege('service_role', 'public.get_billing_credit_balance(uuid)', 'execute'), 'service role can query balance RPC');
select ok(
  has_function_privilege(
    'service_role',
    'public.fulfill_stripe_credit_purchase(uuid,text,text,text,text,text,bigint,text,integer)',
    'execute'
  ),
  'service role can fulfill credit purchases'
);

insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');
set local role service_role;

select is(
  (
    select applied
    from public.fulfill_stripe_credit_purchase(
      '11111111-1111-4111-8111-111111111111',
      'cus_test123',
      'evt_test123',
      'cs_test123',
      'pi_test123',
      'price_test123',
      1000,
      'usd',
      20
    )
  ),
  true,
  'first webhook delivery grants credits'
);

select is(
  public.get_billing_credit_balance('11111111-1111-4111-8111-111111111111'),
  20::bigint,
  'balance is derived from ledger entries'
);

select is(
  (
    select applied
    from public.fulfill_stripe_credit_purchase(
      '11111111-1111-4111-8111-111111111111',
      'cus_test123',
      'evt_test123',
      'cs_test123',
      'pi_test123',
      'price_test123',
      1000,
      'usd',
      20
    )
  ),
  false,
  'duplicate webhook delivery is idempotent'
);

reset role;

select is(
  (select count(*) from public.billing_credit_ledger where user_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'duplicate fulfillment creates one ledger entry'
);

select * from finish();

rollback;
