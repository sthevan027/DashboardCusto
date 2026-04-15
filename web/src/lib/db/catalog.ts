/**
 * Nomes de tabelas e views expostos ao PostgREST (Supabase).
 * Convenção: prefixo `cost_` no domínio de custos; views de leitura `vw_cost_*`.
 * Altere aqui e no schema SQL em conjunto.
 */
export const T = {
  app_profiles: 'app_profiles',
  cost_groups: 'cost_groups',
  cost_subgroups: 'cost_subgroups',
  cost_items: 'cost_items',
  cost_budgets: 'cost_budgets',
  cost_entries: 'cost_entries',
  cost_entries_audit: 'cost_entries_audit',
} as const

export const V = {
  cost_analysis: 'vw_cost_analysis',
  cost_budget_line_unique: 'vw_cost_budget_line_unique',
  cost_group_summary: 'vw_cost_group_summary',
  cost_subgroup_summary: 'vw_cost_subgroup_summary',
  cost_activity_analysis: 'vw_cost_activity_analysis',
  cost_contract_only_items: 'vw_cost_contract_only_items',
  cost_monthly_group_actuals: 'vw_cost_monthly_group_actuals',
  cost_monthly_total_actuals: 'vw_cost_monthly_total_actuals',
  cost_item_lookup: 'vw_cost_item_lookup',
  cost_audit_enriched: 'vw_cost_audit_enriched',
  cost_visual_breakdown: 'vw_cost_visual_breakdown',
} as const
