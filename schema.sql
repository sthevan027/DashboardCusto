-- JL-DashboardCusto - PostgreSQL schema (Supabase-friendly)
-- Sections:
-- 1. Tables
-- 2. Indexes
-- 3. Seed data
-- 4. Views
-- 5. Queries

-- =========================
-- 1) TABLES
-- =========================

-- Groups are the top-level buckets (e.g., "Mão de Obra")
create table if not exists public.groups (
  id bigint generated always as identity primary key,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_name_uk unique (name)
);

-- Subgroups are optional children of groups
create table if not exists public.subgroups (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete restrict,
  name text not null,
  code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subgroups_group_name_uk unique (group_id, name),
  constraint subgroups_id_group_uk unique (id, group_id)
);

-- Items are the final tracking level (each item belongs to a group and optionally a subgroup)
create table if not exists public.items (
  id bigint generated always as identity primary key,
  group_id bigint not null references public.groups(id) on delete restrict,
  subgroup_id bigint null,
  name text not null,
  code text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_group_name_uk unique (group_id, name),
  constraint items_subgroup_consistency_fk
    foreign key (subgroup_id, group_id)
    references public.subgroups(id, group_id)
    on delete restrict
);

-- Budgets store the planned value per item (total budget for that item)
create table if not exists public.budgets (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  planned_value numeric(14,2) not null,
  currency_code char(3) not null default 'BRL',
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_item_uk unique (item_id),
  constraint budgets_planned_value_ck check (planned_value >= 0)
);

-- Costs are the actual monthly execution values (can have multiple entries per item)
create table if not exists public.costs (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.items(id) on delete cascade,
  cost_date date not null,
  amount numeric(14,2) not null,
  description text null,
  external_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint costs_amount_ck check (amount >= 0),
  constraint costs_item_external_uk unique (item_id, external_id)
);

-- =========================
-- 2) INDEXES
-- =========================

-- Foreign-key helper indexes
create index if not exists idx_subgroups_group_id on public.subgroups(group_id);
create index if not exists idx_items_group_id on public.items(group_id);
create index if not exists idx_items_subgroup_id on public.items(subgroup_id);
create index if not exists idx_budgets_item_id on public.budgets(item_id);

-- Costs performance indexes (as required)
create index if not exists idx_costs_item_id on public.costs(item_id);
create index if not exists idx_costs_cost_date on public.costs(cost_date);
create index if not exists idx_costs_item_date on public.costs(item_id, cost_date);

-- =========================
-- 3) SEED DATA
-- =========================

-- Groups
insert into public.groups (name, code)
values
  ('Mão de Obra', 'MO'),
  ('Equipamentos', 'EQ')
on conflict (name) do nothing;

-- Subgroups
insert into public.subgroups (group_id, name, code)
select g.id, s.name, s.code
from public.groups g
join (values
  ('Mão de Obra', 'Equipe de Campo', 'MO-CAMPO'),
  ('Mão de Obra', 'Mobilização', 'MO-MOB'),
  ('Equipamentos', 'Locação', 'EQ-LOC')
) as s(group_name, name, code)
  on s.group_name = g.name
on conflict (group_id, name) do nothing;

-- Items (5+)
insert into public.items (group_id, subgroup_id, name, code)
select
  g.id,
  sg.id,
  i.name,
  i.code
from public.groups g
left join public.subgroups sg
  on sg.group_id = g.id
join (values
  ('Mão de Obra', 'Mobilização', 'Mobilização de equipe e equipamentos', '1.1.1.1.1'),
  ('Mão de Obra', 'Mobilização', 'Desmobilização de equipe e equipamentos', '1.1.1.1.2'),
  ('Mão de Obra', 'Equipe de Campo', 'Equipe de montagem (soldadores e ajudantes)', '1.1.2.1.1'),
  ('Equipamentos', 'Locação', 'Ônibus (transporte de equipe)', '2.1.1.1.1'),
  ('Equipamentos', 'Locação', 'Guindaste (apoio a montagem)', '2.1.1.1.2')
) as i(group_name, subgroup_name, name, code)
  on i.group_name = g.name
 and (i.subgroup_name is null or sg.name = i.subgroup_name)
where (i.subgroup_name is null and sg.id is null) or (i.subgroup_name is not null and sg.id is not null)
on conflict (group_id, name) do nothing;

-- Budgets (planned values)
insert into public.budgets (item_id, planned_value, currency_code, effective_date)
select it.id, b.planned_value, 'BRL', date '2026-01-01'
from public.items it
join (values
  ('Mobilização de equipe e equipamentos', 5000.00),
  ('Desmobilização de equipe e equipamentos', 3000.00),
  ('Equipe de montagem (soldadores e ajudantes)', 25000.00),
  ('Ônibus (transporte de equipe)', 12000.00),
  ('Guindaste (apoio a montagem)', 18000.00)
) as b(item_name, planned_value)
  on b.item_name = it.name
on conflict (item_id) do nothing;

-- Costs (monthly actual entries)
insert into public.costs (item_id, cost_date, amount, description, external_id)
select it.id, c.cost_date, c.amount, c.description, c.external_id
from public.items it
join (values
  ('Mobilização de equipe e equipamentos', date '2026-01-10', 1000.00, 'Mobilização - diária equipe', 'MO-MOB-2026-01-01'),
  ('Mobilização de equipe e equipamentos', date '2026-02-10', 800.00, 'Mobilização - ajuste transporte', 'MO-MOB-2026-02-01'),
  ('Desmobilização de equipe e equipamentos', date '2026-03-05', 1200.00, 'Desmobilização parcial', 'MO-DESM-2026-03-01'),
  ('Equipe de montagem (soldadores e ajudantes)', date '2026-01-31', 7000.00, 'Folha + encargos (jan)', 'MO-CAMPO-2026-01'),
  ('Equipe de montagem (soldadores e ajudantes)', date '2026-02-28', 8500.00, 'Folha + encargos (fev)', 'MO-CAMPO-2026-02'),
  ('Equipe de montagem (soldadores e ajudantes)', date '2026-03-31', 9500.00, 'Folha + encargos (mar)', 'MO-CAMPO-2026-03'),
  ('Ônibus (transporte de equipe)', date '2026-01-20', 2500.00, 'Locação ônibus (jan)', 'EQ-ONIBUS-2026-01'),
  ('Ônibus (transporte de equipe)', date '2026-02-20', 3000.00, 'Locação ônibus (fev)', 'EQ-ONIBUS-2026-02'),
  ('Guindaste (apoio a montagem)', date '2026-02-15', 6000.00, 'Guindaste (fev) - 3 dias', 'EQ-GUINDASTE-2026-02'),
  ('Guindaste (apoio a montagem)', date '2026-03-15', 9000.00, 'Guindaste (mar) - 4 dias', 'EQ-GUINDASTE-2026-03')
) as c(item_name, cost_date, amount, description, external_id)
  on c.item_name = it.name
on conflict (item_id, external_id) do nothing;

-- =========================
-- 4) VIEWS
-- =========================

create or replace view public.vw_cost_analysis as
with actuals as (
  select
    c.item_id,
    sum(c.amount) as actual_value
  from public.costs c
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
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.9 then 'CRITICAL'
    when coalesce(a.actual_value, 0) >= b.planned_value * 0.7 then 'WARNING'
    else 'OK'
  end as status
from public.items i
join public.groups g on g.id = i.group_id
join public.budgets b on b.item_id = i.id
left join actuals a on a.item_id = i.id;

-- =========================
-- 5) QUERIES
-- =========================

-- 5.1 Total summary (planned vs actual vs balance)
-- (Use the view to stay consistent with status/percent rules)
-- select
--   sum(planned_value) as total_planned,
--   sum(actual_value) as total_actual,
--   sum(balance) as total_balance
-- from public.vw_cost_analysis;

-- 5.2 Top 5 highest risk items (prioritize OVERBUDGET > CRITICAL > WARNING > OK)
-- select
--   *
-- from public.vw_cost_analysis
-- order by
--   case status
--     when 'OVERBUDGET' then 4
--     when 'CRITICAL' then 3
--     when 'WARNING' then 2
--     else 1
--   end desc,
--   percent_used desc nulls last
-- limit 5;

-- 5.3 Monthly evolution (grouped by month)
-- select
--   date_trunc('month', c.cost_date)::date as month,
--   sum(c.amount) as actual_value
-- from public.costs c
-- group by 1
-- order by 1;

-- 5.4 Breakdown by group (planned vs actual vs balance)
-- select
--   v.group_name,
--   sum(v.planned_value) as planned_value,
--   sum(v.actual_value) as actual_value,
--   sum(v.balance) as balance
-- from public.vw_cost_analysis v
-- group by v.group_name
-- order by v.group_name;

