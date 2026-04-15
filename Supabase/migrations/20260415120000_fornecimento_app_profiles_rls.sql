-- Fornecimento nas views (espelho Total × grupos operacionais), tabela app_profiles e RLS:
-- leitura pública (anon) nos custos; escrita só para usuário com perfil admin.

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'admin'),
  created_at timestamptz not null default now()
);

create index if not exists idx_app_profiles_role on public.app_profiles(role);

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

grant select on public.vw_cost_audit_enriched to authenticated;
grant select on table public.app_profiles to authenticated;
grant delete on table public.cost_entries_audit to authenticated;

revoke select on public.vw_cost_audit_enriched from anon;
revoke delete on table public.cost_entries_audit from anon;
