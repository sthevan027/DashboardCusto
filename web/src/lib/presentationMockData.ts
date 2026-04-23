import type { GroupRow, SubgroupRow } from "./dashboardTypes";

function groupMetrics(
  name: string,
  planned: number,
  actual: number,
): GroupRow {
  const balance = planned - actual;
  const percent_used = planned > 0 ? actual / planned : null;
  let status = "OK";
  if (actual > planned) status = "OVERBUDGET";
  else if (percent_used != null && actual >= planned * 0.9) status = "HIGH_USAGE";
  else if (percent_used != null && actual >= planned * 0.7) status = "WARNING";
  return {
    group_name: name,
    planned_value: planned,
    actual_value: actual,
    balance,
    percent_used,
    status,
  };
}

function subgroupMetrics(
  group: string,
  name: string,
  planned: number,
  actual: number,
): SubgroupRow {
  const g = groupMetrics(group, planned, actual);
  return { ...g, subgroup_name: name };
}

/**
 * Cenário de apresentação: base contratual ≈ R$ 50M; real acumulado ≈ R$ 20M
 * (os cinco tópicos do quadro; “Outros (só no contrato)” fica fora do total principal no app).
 */
export const mockDashboardGroups: GroupRow[] = [
  groupMetrics("Mão de Obra", 10_300_000, 4_300_000),
  groupMetrics("Equipamento", 21_500_000, 8_600_000),
  groupMetrics("Materiais", 8_600_000, 3_650_000),
  groupMetrics("Fornecimento", 6_900_000, 2_800_000),
  groupMetrics("Outros (só no contrato)", 1_200_000, 250_000),
  groupMetrics("Indiretos", 2_700_000, 650_000),
];

export const mockDashboardSubgroups: SubgroupRow[] = [
  subgroupMetrics("Mão de Obra", "Operação / mão de obra fixa", 4_120_000, 1_790_000),
  subgroupMetrics("Mão de Obra", "Supervisão e coordenação", 1_888_000, 780_000),
  subgroupMetrics("Mão de Obra", "Jornada extra e reforço", 1_545_000, 660_000),
  subgroupMetrics("Mão de Obra", "Terceirizado temporário", 2_747_000, 1_070_000),
  subgroupMetrics("Equipamento", "Máquinas pesadas / locação", 9_460_000, 3_840_000),
  subgroupMetrics("Equipamento", "Ferramentas e pequeno equipamento", 3_612_000, 1_520_000),
  subgroupMetrics("Equipamento", "Manutenção corretiva", 2_408_000, 1_020_000),
  subgroupMetrics("Equipamento", "Proteção e acessórios de obra", 6_020_000, 2_220_000),
  subgroupMetrics("Materiais", "Cimento e agregados", 2_666_000, 1_150_000),
  subgroupMetrics("Materiais", "Aço e estrutura metálica", 2_150_000, 950_000),
  subgroupMetrics("Materiais", "Materiais elétricos e hidráulicos", 1_892_000, 800_000),
  subgroupMetrics("Materiais", "Consumíveis e pequena monta", 1_892_000, 750_000),
  subgroupMetrics("Fornecimento", "Locação de andaimes e escoramento", 2_415_000, 1_020_000),
  subgroupMetrics("Fornecimento", "Transporte e frete de insumos", 2_760_000, 1_160_000),
  subgroupMetrics("Fornecimento", "Serviços técnicos especializados", 1_725_000, 620_000),
];

export type MockVisualActivity = {
  item_id: number;
  item_name: string;
  planned_value: number;
  actual_value: number;
  balance: number;
  percent_used: number | null;
  status: string;
  item_code: string | null;
};

function activityFromGroup(
  itemId: number,
  itemName: string,
  itemCode: string | null,
  planned: number,
  actual: number,
): MockVisualActivity {
  const g = groupMetrics("_", planned, actual);
  return {
    item_id: itemId,
    item_name: itemName,
    item_code: itemCode,
    planned_value: g.planned_value,
    actual_value: g.actual_value,
    balance: g.balance,
    percent_used: g.percent_used,
    status: g.status,
  };
}

export const mockVisualActivities: MockVisualActivity[] = [
  activityFromGroup(
    10_001,
    "Instalações e infraestrutura de canteiro",
    "2.1.1.1",
    1_550_000,
    1_390_000,
  ),
  activityFromGroup(10_002, "Contenções e sondagens (macro)", "2.1.1.2", 3_620_000, 3_010_000),
  activityFromGroup(
    10_003,
    "Estrutura e alvenaria principal",
    "2.1.1.3",
    7_650_000,
    5_250_000,
  ),
];

export type MockVisualBreakdown = {
  item_id: number;
  item_name: string;
  group_name: string;
  item_code: string | null;
  subgroup_id: number | null;
  subgroup_name: string | null;
  planned_value: number;
  actual_value: number;
  balance: number;
  percent_used: number | null;
  status: string;
};

function breakdownRow(
  itemId: number,
  itemName: string,
  groupName: string,
  itemCode: string | null,
  subgroupId: number | null,
  subgroupName: string | null,
  planned: number,
  actual: number,
): MockVisualBreakdown {
  const g = groupMetrics("_", planned, actual);
  return {
    item_id: itemId,
    item_name: itemName,
    group_name: groupName,
    item_code: itemCode,
    subgroup_id: subgroupId,
    subgroup_name: subgroupName,
    planned_value: g.planned_value,
    actual_value: g.actual_value,
    balance: g.balance,
    percent_used: g.percent_used,
    status: g.status,
  };
}

export const mockVisualBreakdown: MockVisualBreakdown[] = [
  breakdownRow(
    20_001,
    "Instalações e infraestrutura de canteiro",
    "Mão de Obra",
    "2.1.1.1",
    1,
    "Montagem e desmontagem de baús",
    820_000,
    740_000,
  ),
  breakdownRow(
    20_002,
    "Instalações e infraestrutura de canteiro",
    "Materiais",
    "2.1.1.1",
    2,
    "Estrutura metálica leve",
    730_000,
    650_000,
  ),
  breakdownRow(
    20_101,
    "Contenções e sondagens (macro)",
    "Mão de Obra",
    "2.1.1.2",
    3,
    "Equipe de sondagem",
    1_810_000,
    1_710_000,
  ),
  breakdownRow(
    20_102,
    "Contenções e sondagens (macro)",
    "Equipamento",
    "2.1.1.2",
    4,
    "Perfuratriz e acessórios",
    1_810_000,
    1_300_000,
  ),
  breakdownRow(
    20_201,
    "Estrutura e alvenaria principal",
    "Materiais",
    "2.1.1.3",
    5,
    "Aço e forma",
    4_300_000,
    2_900_000,
  ),
  breakdownRow(
    20_202,
    "Estrutura e alvenaria principal",
    "Mão de Obra",
    "2.1.1.3",
    6,
    "Fases de concretagem e cura",
    3_350_000,
    2_350_000,
  ),
];

export const mockLancamentoItems = [
  {
    item_id: 30_001,
    item_code: "2.1.1.1",
    item_name: "Instalações e infraestrutura de canteiro",
    group_name: "Mão de Obra",
    subgroup_name: "Montagem e desmontagem de baús",
    planned_value: 820_000,
  },
  {
    item_id: 30_002,
    item_code: "2.1.1.1",
    item_name: "Estrutura metálica leve (canteiro)",
    group_name: "Materiais",
    subgroup_name: "Carpintaria e chapas",
    planned_value: 730_000,
  },
  {
    item_id: 30_003,
    item_code: "2.1.1.2",
    item_name: "Contenções — equipe e turnos",
    group_name: "Mão de Obra",
    subgroup_name: "Sondagem",
    planned_value: 1_810_000,
  },
  {
    item_id: 30_004,
    item_code: "2.1.1.3",
    item_name: "Aço, forma e concreto (fase 1)",
    group_name: "Materiais",
    subgroup_name: "Estrutura",
    planned_value: 4_300_000,
  },
];

export const mockLancamentoRecent = [
  {
    id: 9_001,
    item_id: 30_001,
    cost_date: "2026-04-18",
    amount: 107_500,
    description: "Reforço de canteiro — concreto magro",
    created_at: "2026-04-18T16:20:00.000Z",
  },
  {
    id: 9_002,
    item_id: 30_003,
    cost_date: "2026-04-15",
    amount: 156_200,
    description: "Hora-máquina sondagem",
    created_at: "2026-04-16T10:02:00.000Z",
  },
  {
    id: 9_003,
    item_id: 30_002,
    cost_date: "2026-04-10",
    amount: 58_500,
    description: "Ajuste de peças e fixadores",
    created_at: "2026-04-10T11:30:00.000Z",
  },
];

export const mockHistoricoAudit = [
  {
    id: 1,
    cost_id: 9_001,
    action: "INSERT",
    changed_at: "2026-04-18T16:20:00.000Z",
    changed_by: null,
    changed_by_name: "Ana (demo)",
    item_id: 30_001,
    cost_date_text: "2026-04-18",
    amount: 107_500,
    item_name: "Instalações e infraestrutura de canteiro",
    group_name: "Mão de Obra",
    old_row: null,
    new_row: { amount: 107_500 },
  },
  {
    id: 2,
    cost_id: 9_002,
    action: "INSERT",
    changed_at: "2026-04-16T10:02:00.000Z",
    changed_by: null,
    changed_by_name: "Bruno (demo)",
    item_id: 30_003,
    cost_date_text: "2026-04-15",
    amount: 156_200,
    item_name: "Contenções — equipe e turnos",
    group_name: "Mão de Obra",
    old_row: null,
    new_row: { amount: 156_200 },
  },
  {
    id: 3,
    cost_id: null,
    action: "UPDATE",
    changed_at: "2026-04-12T09:00:00.000Z",
    changed_by: null,
    changed_by_name: "Carla (demo)",
    item_id: 30_004,
    cost_date_text: "2026-04-10",
    amount: null,
    item_name: "Aço, forma e concreto (fase 1)",
    group_name: "Materiais",
    old_row: { planned_value: 4_200_000 },
    new_row: { planned_value: 4_300_000 },
  },
];
