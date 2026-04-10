-- Unifica na leitura os subgrupos "Equipamento" / "Equipamentos" / "EquipamentoS"
-- (grupo Equipamento) para uma única linha "Equipamentos (diversos)".
-- Aplique após schema.sql base ou rode o trecho equivalente em produção.

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
      where g2.name in ('Mão de Obra', 'Equipamento', 'Materiais')
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
