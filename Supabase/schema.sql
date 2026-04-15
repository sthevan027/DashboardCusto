-- Postgres / Supabase: tabelas, índices, funções, triggers, views, RLS.
-- Convenções, seed e contexto do projeto: README.md na raiz do repositório.

create table if not exists public.cost_groups (
  id bigint generated always as identity primary key,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_groups_name_uk unique (name)
);

create table if not exists public.cost_subgroups (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.cost_groups(id) on delete restrict,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_subgroups_group_name_uk unique (group_id, name),
  constraint cost_subgroups_id_group_uk unique (id, group_id)
);

create table if not exists public.cost_items (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.cost_groups(id) on delete restrict,
  subgroup_id bigint null,
  name text not null,
  code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_items_group_name_uk unique (group_id, name),
  constraint cost_items_subgroup_consistency_fk
    foreign key (subgroup_id, group_id)
    references public.cost_subgroups(id, group_id)
    on delete restrict
);

create table if not exists public.cost_budgets (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cost_items(id) on delete cascade,
  planned_value numeric(14,2) not null,
  currency_code char(3) not null default 'BRL',
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_budgets_item_uk unique (item_id),
  constraint cost_budgets_planned_value_ck check (planned_value >= 0)
);

create table if not exists public.cost_entries (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.cost_items(id) on delete cascade,
  cost_date date not null,
  amount numeric(14,2) not null,
  description text null,
  external_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cost_entries_amount_ck check (amount >= 0),
  constraint cost_entries_item_external_uk unique (item_id, external_id)
);

create table if not exists public.cost_entries_audit (
  id bigint generated always as identity primary key,
  cost_id bigint null,
  action text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid null,
  old_row jsonb null,
  new_row jsonb null
);

-- Uma linha por usuário do Auth com permissão de escrita (inserida manualmente no SQL).
create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'admin'),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_profiles_role on public.app_profiles(role);

-- No máximo um administrador: todas as chaves (1) coincidem; UNIQUE permite só uma linha com role admin.
create unique index if not exists idx_app_profiles_single_admin
  on public.app_profiles ((1))
  where (role = 'admin');

create index if not exists idx_cost_subgroups_group_id on public.cost_subgroups(group_id);
create index if not exists idx_cost_items_group_id on public.cost_items(group_id);
create index if not exists idx_cost_items_subgroup_id on public.cost_items(subgroup_id);
create index if not exists idx_cost_budgets_item_id on public.cost_budgets(item_id);
create index if not exists idx_cost_entries_item_id on public.cost_entries(item_id);
create index if not exists idx_cost_entries_cost_date on public.cost_entries(cost_date);
create index if not exists idx_cost_entries_item_date on public.cost_entries(item_id, cost_date);
create index if not exists idx_cost_entries_audit_cost_id on public.cost_entries_audit(cost_id);
create index if not exists idx_cost_entries_audit_changed_at on public.cost_entries_audit(changed_at);

create or replace function public.fn_cost_entries_require_budget()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.cost_budgets b
    where b.item_id = new.item_id
  ) then
    raise exception 'Item % não possui orçamento (budgets). Crie o budget antes de lançar custos.', new.item_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cost_entries_require_budget on public.cost_entries;
create trigger trg_cost_entries_require_budget
before insert or update of item_id on public.cost_entries
for each row
execute function public.fn_cost_entries_require_budget();

create or replace function public.fn_cost_entries_audit()
returns trigger
language plpgsql
as $$
declare
  v_user uuid;
begin
  begin
    v_user := auth.uid();
  exception when undefined_function then
    v_user := null;
  end;

  if tg_op = 'INSERT' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (new.id, 'INSERT', v_user, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (new.id, 'UPDATE', v_user, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.cost_entries_audit (cost_id, action, changed_by, old_row, new_row)
    values (old.id, 'DELETE', v_user, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cost_entries_audit on public.cost_entries;
create trigger trg_cost_entries_audit
after insert or update or delete on public.cost_entries
for each row
execute function public.fn_cost_entries_audit();

create or replace view public.vw_cost_analysis
with (security_invoker = true)
as
with actuals as (
  select
    c.item_id,
    sum(c.amount) as actual_value
  from public.cost_entries c
  group by c.item_id
)
select
  i.id as item_id,
  i.name as item_name,
  g.name as group_name,
  b.planned_value as planned_value,
  coalesce(a.actual_value, 0)::numeric(14,2) as actual_value,
  (b.planned_value - coalesce(a.actual_value, 0))::numeric(14,2) as balance,
  case
    when b.planned_value = 0 then null
    else (coalesce(a.actual_value, 0) / nullif(b.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when coalesce(a.actual_value, 0) > b.planned_value then 'OVERBUDGET'
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.9 then 'HIGH_USAGE'
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from public.cost_items i
join public.cost_groups g on g.id = i.group_id
join public.cost_budgets b on b.item_id = i.id
left join actuals a on a.item_id = i.id;

create or replace view public.vw_cost_budget_line_unique
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.group_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status,
  i.code as item_code,
  i.id::text as dedup_key
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total';

create or replace view public.vw_cost_group_summary
with (security_invoker = true)
as
with group_totals as (
  select
    v.group_name,
    sum(v.planned_value)::numeric(14,2) as planned_value,
    sum(v.actual_value)::numeric(14,2) as actual_value
  from public.vw_cost_budget_line_unique v
  group by v.group_name
),
only_contract as (
  select
    'Outros (só no contrato)' as group_name,
    coalesce(sum(v.planned_value), 0)::numeric(14,2) as planned_value,
    coalesce(sum(v.actual_value), 0)::numeric(14,2) as actual_value
  from public.vw_cost_analysis v
  join public.cost_items i on i.id = v.item_id
  join public.cost_groups g on g.id = i.group_id
  where g.name = 'Total'
    and not exists (
      select 1
      from public.cost_items i2
      join public.cost_groups g2 on g2.id = i2.group_id
      where g2.name is distinct from 'Total'
        and (
          (i.code is not null and i2.code is not null and i2.code = i.code)
          or (i.code is null and i2.code is null and i2.name = i.name)
        )
    )
),
merged as (
  select * from group_totals
  union all
  select o.group_name, o.planned_value, o.actual_value
  from only_contract o
  where o.planned_value > 0 or o.actual_value > 0
)
select
  m.group_name,
  m.planned_value,
  m.actual_value,
  (m.planned_value - m.actual_value)::numeric(14,2) as balance,
  case
    when m.planned_value = 0 then null
    else (m.actual_value / nullif(m.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when m.actual_value > m.planned_value then 'OVERBUDGET'
    when m.actual_value >= m.planned_value * 0.9 then 'HIGH_USAGE'
    when m.actual_value >= m.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from merged m;

create or replace view public.vw_cost_subgroup_summary
with (security_invoker = true)
as
with by_raw_subgroup as (
  select
    g.name as group_name,
    coalesce(sg.name, '—') as raw_subgroup_name,
    sum(v.planned_value)::numeric(14,2) as planned_value,
    sum(v.actual_value)::numeric(14,2) as actual_value
  from public.vw_cost_budget_line_unique v
  join public.cost_items i on i.id = v.item_id
  left join public.cost_subgroups sg on sg.id = i.subgroup_id
  join public.cost_groups g on g.id = i.group_id
  where g.name <> 'Total'
  group by g.name, coalesce(sg.name, '—')
),
sub_totals as (
  select
    br.group_name,
    case
      when br.group_name = 'Equipamento'
        and regexp_replace(lower(trim(br.raw_subgroup_name)), '\s+', '', 'g') ~ '^(equipamento|equipamentos)$'
      then 'Equipamentos (diversos)'
      else br.raw_subgroup_name
    end as subgroup_name,
    sum(br.planned_value)::numeric(14,2) as planned_value,
    sum(br.actual_value)::numeric(14,2) as actual_value
  from by_raw_subgroup br
  group by
    br.group_name,
    case
      when br.group_name = 'Equipamento'
        and regexp_replace(lower(trim(br.raw_subgroup_name)), '\s+', '', 'g') ~ '^(equipamento|equipamentos)$'
      then 'Equipamentos (diversos)'
      else br.raw_subgroup_name
    end
),
only_contract_sub as (
  select
    'Outros (só no contrato)' as group_name,
    '—' as subgroup_name,
    coalesce(sum(v.planned_value), 0)::numeric(14,2) as planned_value,
    coalesce(sum(v.actual_value), 0)::numeric(14,2) as actual_value
  from public.vw_cost_analysis v
  join public.cost_items i on i.id = v.item_id
  join public.cost_groups g on g.id = i.group_id
  where g.name = 'Total'
    and not exists (
      select 1
      from public.cost_items i2
      join public.cost_groups g2 on g2.id = i2.group_id
      where g2.name is distinct from 'Total'
        and (
          (i.code is not null and i2.code is not null and i2.code = i.code)
          or (i.code is null and i2.code is null and i2.name = i.name)
        )
    )
),
merged_sub as (
  select * from sub_totals
  union all
  select s.group_name, s.subgroup_name, s.planned_value, s.actual_value
  from only_contract_sub s
  where s.planned_value > 0 or s.actual_value > 0
)
select
  ms.group_name,
  ms.subgroup_name,
  ms.planned_value,
  ms.actual_value,
  (ms.planned_value - ms.actual_value)::numeric(14,2) as balance,
  case
    when ms.planned_value = 0 then null
    else (ms.actual_value / nullif(ms.planned_value, 0))::numeric(14,4)
  end as percent_used,
  case
    when ms.actual_value > ms.planned_value then 'OVERBUDGET'
    when ms.actual_value >= ms.planned_value * 0.9 then 'HIGH_USAGE'
    when ms.actual_value >= ms.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from merged_sub ms;

create or replace view public.vw_cost_activity_analysis
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status,
  i.code as item_code
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
where v.group_name = 'Total';

create or replace view public.vw_cost_contract_only_items
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  i.code as item_code,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
join public.cost_groups g on g.id = i.group_id
where g.name = 'Total'
  and not exists (
    select 1
    from public.cost_items i2
    join public.cost_groups g2 on g2.id = i2.group_id
    where g2.name is distinct from 'Total'
      and (
        (i.code is not null and i2.code is not null and i2.code = i.code)
        or (i.code is null and i2.code is null and i2.name = i.name)
      )
  );

create or replace view public.vw_cost_monthly_group_actuals
with (security_invoker = true)
as
select
  date_trunc('month', c.cost_date)::date as month,
  g.name as group_name,
  sum(c.amount)::numeric(14,2) as actual_value
from public.cost_entries c
join public.cost_items i on i.id = c.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total'
group by 1, 2
order by 1, 2;

create or replace view public.vw_cost_monthly_total_actuals
with (security_invoker = true)
as
select
  date_trunc('month', c.cost_date)::date as month,
  sum(c.amount)::numeric(14,2) as actual_value
from public.cost_entries c
join public.cost_items i on i.id = c.item_id
join public.cost_groups g on g.id = i.group_id
where g.name <> 'Total'
group by 1
order by 1;

create or replace view public.vw_cost_item_lookup
with (security_invoker = true)
as
select
  i.id as item_id,
  i.code as item_code,
  i.name as item_name,
  g.name as group_name,
  sg.id as subgroup_id,
  sg.name as subgroup_name,
  b.planned_value
from public.cost_items i
join public.cost_groups g on g.id = i.group_id
left join public.cost_subgroups sg on sg.id = i.subgroup_id
join public.cost_budgets b on b.item_id = i.id
where g.name <> 'Total'
  and coalesce(i.is_active, true) = true;

create or replace view public.vw_cost_audit_enriched
with (security_invoker = true)
as
select
  ca.id,
  ca.cost_id,
  ca.action,
  ca.changed_at,
  ca.changed_by,
  coalesce(
    (ca.new_row->>'item_id')::bigint,
    (ca.old_row->>'item_id')::bigint
  ) as item_id,
  coalesce(ca.new_row->>'cost_date', ca.old_row->>'cost_date') as cost_date_text,
  coalesce((ca.new_row->>'amount')::numeric, (ca.old_row->>'amount')::numeric) as amount,
  i.name as item_name,
  g.name as group_name,
  ca.old_row,
  ca.new_row
from public.cost_entries_audit ca
left join public.cost_items i
  on i.id = coalesce(
    (ca.new_row->>'item_id')::bigint,
    (ca.old_row->>'item_id')::bigint
  )
left join public.cost_groups g on g.id = i.group_id;

create or replace view public.vw_cost_visual_breakdown
with (security_invoker = true)
as
select
  v.item_id,
  v.item_name,
  v.group_name,
  i.code as item_code,
  i.subgroup_id,
  case
    when v.group_name = 'Equipamento'
      and sg.name is not null
      and regexp_replace(lower(trim(sg.name)), '\s+', '', 'g') ~ '^(equipamento|equipamentos)$'
    then 'Equipamentos (diversos)'
    else sg.name
  end as subgroup_name,
  v.planned_value,
  v.actual_value,
  v.balance,
  v.percent_used,
  v.status
from public.vw_cost_analysis v
join public.cost_items i on i.id = v.item_id
left join public.cost_subgroups sg on sg.id = i.subgroup_id
where v.group_name <> 'Total';

create or replace function public.jl_is_cost_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

revoke all on function public.jl_is_cost_admin() from public;
grant execute on function public.jl_is_cost_admin() to authenticated;

alter table public.cost_groups enable row level security;
alter table public.cost_subgroups enable row level security;
alter table public.cost_items enable row level security;
alter table public.cost_budgets enable row level security;
alter table public.cost_entries enable row level security;
alter table public.cost_entries_audit enable row level security;
alter table public.app_profiles enable row level security;

drop policy if exists "jl_anon_select_groups" on public.cost_groups;
drop policy if exists "jl_anon_select_subgroups" on public.cost_subgroups;
drop policy if exists "jl_anon_select_items" on public.cost_items;
drop policy if exists "jl_anon_all_budgets" on public.cost_budgets;
drop policy if exists "jl_anon_select_budgets" on public.cost_budgets;
drop policy if exists "jl_budgets_ins_admin" on public.cost_budgets;
drop policy if exists "jl_budgets_upd_admin" on public.cost_budgets;
drop policy if exists "jl_budgets_del_admin" on public.cost_budgets;
drop policy if exists "jl_anon_all_cost_entries" on public.cost_entries;
drop policy if exists "jl_anon_select_cost_entries" on public.cost_entries;
drop policy if exists "jl_entries_ins_admin" on public.cost_entries;
drop policy if exists "jl_entries_upd_admin" on public.cost_entries;
drop policy if exists "jl_entries_del_admin" on public.cost_entries;
drop policy if exists "jl_anon_select_cost_entries_audit" on public.cost_entries_audit;
drop policy if exists "jl_anon_insert_cost_entries_audit" on public.cost_entries_audit;
drop policy if exists "jl_anon_delete_cost_entries_audit" on public.cost_entries_audit;
drop policy if exists "jl_audit_sel_admin" on public.cost_entries_audit;
drop policy if exists "jl_audit_ins_admin" on public.cost_entries_audit;
drop policy if exists "jl_audit_del_admin" on public.cost_entries_audit;
drop policy if exists "jl_anon_update_subgroups" on public.cost_subgroups;
drop policy if exists "jl_subgroups_upd_admin" on public.cost_subgroups;
drop policy if exists "jl_profile_sel_own" on public.app_profiles;

create policy "jl_anon_select_groups"
  on public.cost_groups for select using (true);

create policy "jl_anon_select_subgroups"
  on public.cost_subgroups for select using (true);

create policy "jl_anon_select_items"
  on public.cost_items for select using (true);

create policy "jl_anon_select_budgets"
  on public.cost_budgets for select using (true);

create policy "jl_budgets_ins_admin"
  on public.cost_budgets for insert to authenticated
  with check (public.jl_is_cost_admin());

create policy "jl_budgets_upd_admin"
  on public.cost_budgets for update to authenticated
  using (public.jl_is_cost_admin())
  with check (public.jl_is_cost_admin());

create policy "jl_budgets_del_admin"
  on public.cost_budgets for delete to authenticated
  using (public.jl_is_cost_admin());

create policy "jl_anon_select_cost_entries"
  on public.cost_entries for select using (true);

create policy "jl_entries_ins_admin"
  on public.cost_entries for insert to authenticated
  with check (public.jl_is_cost_admin());

create policy "jl_entries_upd_admin"
  on public.cost_entries for update to authenticated
  using (public.jl_is_cost_admin())
  with check (public.jl_is_cost_admin());

create policy "jl_entries_del_admin"
  on public.cost_entries for delete to authenticated
  using (public.jl_is_cost_admin());

create policy "jl_audit_sel_admin"
  on public.cost_entries_audit for select to authenticated
  using (public.jl_is_cost_admin());

create policy "jl_audit_ins_admin"
  on public.cost_entries_audit for insert to authenticated
  with check (public.jl_is_cost_admin());

create policy "jl_audit_del_admin"
  on public.cost_entries_audit for delete to authenticated
  using (public.jl_is_cost_admin());

create policy "jl_subgroups_upd_admin"
  on public.cost_subgroups for update to authenticated
  using (public.jl_is_cost_admin())
  with check (public.jl_is_cost_admin());

create policy "jl_profile_sel_own"
  on public.app_profiles for select to authenticated
  using (auth.uid() = id);

grant usage on schema public to anon, authenticated;
grant select on public.vw_cost_analysis to anon, authenticated;
grant select on public.vw_cost_budget_line_unique to anon, authenticated;
grant select on public.vw_cost_group_summary to anon, authenticated;
grant select on public.vw_cost_activity_analysis to anon, authenticated;
grant select on public.vw_cost_contract_only_items to anon, authenticated;
grant select on public.vw_cost_monthly_group_actuals to anon, authenticated;
grant select on public.vw_cost_monthly_total_actuals to anon, authenticated;
grant select on public.vw_cost_item_lookup to anon, authenticated;
grant select on public.vw_cost_visual_breakdown to anon, authenticated;
grant select on public.vw_cost_subgroup_summary to anon, authenticated;
grant select on public.vw_cost_audit_enriched to authenticated;

grant select on table public.app_profiles to authenticated;
grant delete on table public.cost_entries_audit to authenticated;
