begin;
create table if not exists private.studio_founder_months(month date primary key, total integer not null check(total between 0 and 100000), updated_at timestamptz not null default now());
alter table private.studio_founder_months enable row level security;
insert into private.studio_founder_months(month,total) values('2026-11-01',76) on conflict(month) do nothing;
create or replace function private.studio_founder_counter() returns jsonb language sql stable security definer set search_path='' as $$ select coalesce((select jsonb_build_object('month',month,'total',total,'updated_at',updated_at) from private.studio_founder_months where month=date_trunc('month',now() at time zone 'America/Los_Angeles')::date),'{}'::jsonb) $$;
create or replace function public.studio_founder_counter() returns jsonb language sql stable set search_path='' as $$ select private.studio_founder_counter() $$;
create or replace function private.studio_founder_counter_save(p_month date,p_total integer) returns void language plpgsql security definer set search_path='' as $$ begin
if not private.studio_admin_authorized() then raise exception 'Owner verification required' using errcode='42501'; end if;
if p_month is null or extract(day from p_month)<>1 or p_total is null or p_total<0 or p_total>100000 then raise exception 'Invalid monthly total'; end if;
insert into private.studio_founder_months values(p_month,p_total,now()) on conflict(month) do update set total=excluded.total,updated_at=excluded.updated_at;
end $$;
create or replace function public.studio_founder_counter_save(p_month date,p_total integer) returns void language sql set search_path='' as $$ select private.studio_founder_counter_save(p_month,p_total) $$;
create or replace function private.studio_owner_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare result jsonb; begin
if not private.studio_admin_authorized() then raise exception 'Owner verification required' using errcode='42501'; end if;
with accounts as (select p.id,u.email,p.created_at from public.studio_profiles p join auth.users u on u.id=p.id left join private.studio_analytics_labels l on l.user_id=p.id where p.plan<>'owner' and coalesce(l.audience,'unclassified') not in ('test','owner') and u.deleted_at is null), first_paid as (select a.id,a.email,min(t.occurred_at) as occurred_at from accounts a join private.studio_stripe_transactions t on t.user_id=a.id where t.livemode and t.transaction_kind='subscription' and t.collected_amount_cents>0 group by a.id,a.email)
select jsonb_build_object('paid',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from first_paid order by occurred_at desc limit 20)x),'[]'::jsonb),'signups',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from accounts order by created_at desc limit 20)x),'[]'::jsonb),'as_of',now()) into result; return result; end $$;
create or replace function public.studio_owner_activity() returns jsonb language sql stable set search_path='' as $$ select private.studio_owner_activity() $$;
revoke all on function private.studio_founder_counter(),public.studio_founder_counter(),private.studio_founder_counter_save(date,integer),public.studio_founder_counter_save(date,integer),private.studio_owner_activity(),public.studio_owner_activity() from public;
grant execute on function private.studio_founder_counter(),public.studio_founder_counter() to anon,authenticated;
grant execute on function private.studio_founder_counter_save(date,integer),public.studio_founder_counter_save(date,integer),private.studio_owner_activity(),public.studio_owner_activity() to authenticated;
commit;
revoke all on function private.studio_founder_counter_save(date,integer),public.studio_founder_counter_save(date,integer),private.studio_owner_activity(),public.studio_owner_activity() from anon;
-- Narrow public projection without granting anonymous access to the private schema.
alter function public.studio_founder_counter() security definer;
comment on function public.studio_founder_counter() is 'Intentional public projection: exposes only founder monthly listing count, month and update timestamp; no customer records or mutation.';
