begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(33);

select ok(to_regclass('public.billing_customers') is not null, 'billing customers exists');
select ok(to_regclass('public.billing_subscriptions') is not null, 'billing subscriptions exists');
select ok(to_regclass('public.billing_webhook_events') is not null, 'billing webhook events exists');

select ok((select relrowsecurity from pg_class where oid = 'public.billing_customers'::regclass), 'billing customers has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_subscriptions'::regclass), 'billing subscriptions has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_webhook_events'::regclass), 'billing webhook events has RLS');

select ok(not has_table_privilege('anon', 'public.billing_customers', 'select'), 'anon cannot read billing customers');
select ok(not has_table_privilege('anon', 'public.billing_customers', 'insert'), 'anon cannot insert billing customers');
select ok(not has_table_privilege('anon', 'public.billing_subscriptions', 'select'), 'anon cannot read subscriptions');
select ok(not has_table_privilege('anon', 'public.billing_subscriptions', 'insert'), 'anon cannot insert subscriptions');
select ok(not has_table_privilege('anon', 'public.billing_webhook_events', 'select'), 'anon cannot read webhook events');
select ok(not has_table_privilege('anon', 'public.billing_webhook_events', 'insert'), 'anon cannot insert webhook events');

select ok(not has_table_privilege('authenticated', 'public.billing_customers', 'select'), 'authenticated cannot read billing customers');
select ok(not has_table_privilege('authenticated', 'public.billing_customers', 'insert'), 'authenticated cannot insert billing customers');
select ok(not has_table_privilege('authenticated', 'public.billing_subscriptions', 'select'), 'authenticated cannot read subscriptions');
select ok(not has_table_privilege('authenticated', 'public.billing_subscriptions', 'insert'), 'authenticated cannot insert subscriptions');
select ok(not has_table_privilege('authenticated', 'public.billing_webhook_events', 'select'), 'authenticated cannot read webhook events');
select ok(not has_table_privilege('authenticated', 'public.billing_webhook_events', 'insert'), 'authenticated cannot insert webhook events');

select ok(has_table_privilege('service_role', 'public.billing_customers', 'select'), 'service role can read billing customers');
select ok(has_table_privilege('service_role', 'public.billing_customers', 'insert'), 'service role can insert billing customers');
select ok(has_table_privilege('service_role', 'public.billing_customers', 'update'), 'service role can update billing customers');
select ok(not has_table_privilege('service_role', 'public.billing_customers', 'delete'), 'service role cannot directly delete billing customers');
select ok(has_table_privilege('service_role', 'public.billing_subscriptions', 'select'), 'service role can read subscriptions');
select ok(has_table_privilege('service_role', 'public.billing_subscriptions', 'insert'), 'service role can insert subscriptions');
select ok(has_table_privilege('service_role', 'public.billing_subscriptions', 'update'), 'service role can update subscriptions');
select ok(not has_table_privilege('service_role', 'public.billing_subscriptions', 'delete'), 'service role cannot directly delete subscriptions');
select ok(has_table_privilege('service_role', 'public.billing_webhook_events', 'select'), 'service role can read webhook events');
select ok(has_table_privilege('service_role', 'public.billing_webhook_events', 'insert'), 'service role can insert webhook events');
select ok(has_table_privilege('service_role', 'public.billing_webhook_events', 'update'), 'service role can update webhook events');
select ok(not has_table_privilege('service_role', 'public.billing_webhook_events', 'delete'), 'service role cannot directly delete webhook events');

select ok(exists (select 1 from pg_trigger where tgrelid = 'public.billing_customers'::regclass and tgname = 'billing_customers_set_updated_at' and not tgisinternal), 'billing customer timestamp trigger exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.billing_subscriptions'::regclass and tgname = 'billing_subscriptions_set_updated_at' and not tgisinternal), 'billing subscription timestamp trigger exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.billing_webhook_events'::regclass and tgname = 'billing_webhook_events_set_updated_at' and not tgisinternal), 'billing webhook timestamp trigger exists');

select * from finish();

rollback;
