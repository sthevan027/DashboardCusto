import type { SubgroupRow } from "./dashboardTypes";

export type SubgroupChartBar = {
  id: string;
  /** Texto curto no eixo */
  label: string;
  /** Tooltip / acessibilidade */
  fullLabel: string;
  planned_value: number;
  actual_value: number;
};

export type EqBucketKey =
  | "onibus"
  | "carros"
  | "guindaste"
  | "munck"
  | "maquinas"
  | "container"
  | "eq_generico"
  | "outros";

function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Subgrupo só com o nome genérico (singular/plural), ex.: "Equipamento" vs "Equipamentos". */
function isGenericEquipSubgroupNameFolded(t: string): boolean {
  const compact = t.replace(/\s+/g, "");
  return /^(equipamento|equipamentos)$/.test(compact);
}

function sumPair(rows: SubgroupRow[]): { p: number; a: number } {
  let p = 0;
  let a = 0;
  for (const r of rows) {
    p += Number(r.planned_value);
    a += Number(r.actual_value);
  }
  return { p, a };
}

/** Agrupa linhas de equipamento por palavras-chave do subgrupo. */
export function classifyEquip(sub: string): EqBucketKey {
  const t = fold(sub);
  if (isGenericEquipSubgroupNameFolded(t)) return "eq_generico";
  if (t.includes("onibus") || t.includes("nibus")) return "onibus";
  // No Excel aparece como "Munk" (sem N) e às vezes como "Munck".
  if (t.includes("munck") || t.includes("munk")) return "munck";
  if (t.includes("guindaste")) return "guindaste";
  if (t.includes("container") || (t.includes("cont") && t.includes("iner")))
    return "container";
  if (t.includes("maq") && t.includes("pesad")) return "maquinas";
  if (
    t.includes("carro") ||
    t.includes("leve") ||
    t.includes("veiculo") ||
    t.includes("veículo")
  )
    return "carros";
  return "outros";
}

function classifyMat(sub: string):
  | "ferramental"
  | "consumiveis"
  | "andaime"
  | "cacamba"
  | "outros" {
  const t = fold(sub);
  if (t.includes("ferramental")) return "ferramental";
  if (t.includes("consumivel") || t.includes("consumi")) return "consumiveis";
  if (t.includes("andaime")) return "andaime";
  if (t.includes("cacamba") || t.includes("cancamba")) return "cacamba";
  return "outros";
}

/** Classificação de Materiais por palavras-chave do subgrupo. */
export function classifyMaterial(sub: string):
  | "ferramental"
  | "consumiveis"
  | "andaime"
  | "cacamba"
  | "outros" {
  return classifyMat(sub);
}

/** Soma prevista por grupo (para donut de distribuição). */
export function buildCostDistributionTriplet(rows: SubgroupRow[]): {
  mo: number;
  eq: number;
  mat: number;
} {
  let mo = 0;
  let eq = 0;
  let mat = 0;
  for (const r of rows) {
    const v = Number(r.planned_value);
    if (r.group_name === "Mão de Obra") mo += v;
    else if (r.group_name === "Equipamento") eq += v;
    else if (r.group_name === "Materiais") mat += v;
  }
  return { mo, eq, mat };
}

function sortBarsByPlannedDesc(bars: SubgroupChartBar[]): SubgroupChartBar[] {
  return [...bars].sort((a, b) => b.planned_value - a.planned_value);
}

/**
 * Equipamento: buckets consolidados, ordenados do maior ao menor (previsto).
 */
export function buildEquipmentHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  const eq = rows.filter((r) => r.group_name === "Equipamento");
  const eqBuckets: Record<EqBucketKey, SubgroupRow[]> = {
    onibus: [],
    carros: [],
    guindaste: [],
    munck: [],
    maquinas: [],
    container: [],
    eq_generico: [],
    outros: [],
  };
  for (const r of eq) {
    eqBuckets[classifyEquip(r.subgroup_name)].push(r);
  }

  const eqOrder: { key: EqBucketKey; label: string; full: string }[] = [
    { key: "onibus", label: "Ônibus", full: "Equipamento — Ônibus" },
    { key: "carros", label: "Carros Leve", full: "Equipamento — Carros leves" },
    {
      key: "maquinas",
      label: "Máquinas Pesadas",
      full: "Equipamento — Máquinas pesadas",
    },
    { key: "outros", label: "Outros", full: "Equipamento — Outros" },
    { key: "container", label: "Contêiner", full: "Equipamento — Contêiner" },
    { key: "munck", label: "Munck", full: "Equipamento — Munck" },
    { key: "guindaste", label: "Guindaste", full: "Equipamento — Guindaste" },
  ];

  const bars = eqOrder.map((d) => {
    const s = sumPair(eqBuckets[d.key]);
    return {
      id: `eq-h-${d.key}`,
      label: d.label,
      fullLabel: d.full,
      planned_value: s.p,
      actual_value: s.a,
    };
  });
  return sortBarsByPlannedDesc(bars);
}

export type MatBucketKey =
  | "ferramental"
  | "consumiveis"
  | "andaime"
  | "cacamba"
  | "outros";

/**
 * Materiais: mesmos buckets do gráfico combinado, do maior ao menor (previsto).
 */
export function buildMaterialHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  const mat = rows.filter((r) => r.group_name === "Materiais");
  const matBuckets: Record<MatBucketKey, SubgroupRow[]> = {
    ferramental: [],
    consumiveis: [],
    andaime: [],
    cacamba: [],
    outros: [],
  };
  for (const r of mat) {
    matBuckets[classifyMat(r.subgroup_name)].push(r);
  }

  const matDefs: { key: MatBucketKey; label: string; full: string }[] = [
    { key: "ferramental", label: "Ferramental", full: "Materiais — Ferramental" },
    {
      key: "consumiveis",
      label: "Consumíveis",
      full: "Materiais — Consumíveis",
    },
    { key: "andaime", label: "Andaime", full: "Materiais — Andaime" },
    { key: "cacamba", label: "Caçamba", full: "Materiais — Caçamba" },
    { key: "outros", label: "Outros", full: "Materiais — Outros" },
  ];

  const bars = matDefs.map((d) => {
    const s = sumPair(matBuckets[d.key]);
    return {
      id: `mat-h-${d.key}`,
      label: d.label,
      fullLabel: d.full,
      planned_value: s.p,
      actual_value: s.a,
    };
  });
  return sortBarsByPlannedDesc(bars);
}

/**
 * Série fixa para o gráfico de custos por subgrupo:
 * Mão de Obra → Equipamento (buckets) → Materiais.
 */
export function buildSubgroupChartSeries(rows: SubgroupRow[]): SubgroupChartBar[] {
  const mo = rows.filter((r) => r.group_name === "Mão de Obra");
  const eq = rows.filter((r) => r.group_name === "Equipamento");
  const mat = rows.filter((r) => r.group_name === "Materiais");

  const eqBuckets: Record<EqBucketKey, SubgroupRow[]> = {
    onibus: [],
    carros: [],
    guindaste: [],
    munck: [],
    maquinas: [],
    container: [],
    eq_generico: [],
    outros: [],
  };
  for (const r of eq) {
    eqBuckets[classifyEquip(r.subgroup_name)].push(r);
  }

  const matBuckets: Record<
    "ferramental" | "consumiveis" | "andaime" | "cacamba" | "outros",
    SubgroupRow[]
  > = {
    ferramental: [],
    consumiveis: [],
    andaime: [],
    cacamba: [],
    outros: [],
  };
  for (const r of mat) {
    matBuckets[classifyMat(r.subgroup_name)].push(r);
  }

  const sMo = sumPair(mo);
  const out: SubgroupChartBar[] = [
    {
      id: "mo",
      label: "Mão de obra",
      fullLabel: "Mão de Obra (total)",
      planned_value: sMo.p,
      actual_value: sMo.a,
    },
  ];

  const eqDefs: {
    key: EqBucketKey;
    label: string;
    full: string;
  }[] = [
    { key: "onibus", label: "Ônibus", full: "Equipamento — Ônibus" },
    { key: "carros", label: "Carros Leve", full: "Equipamento — Carros leves" },
    {
      key: "maquinas",
      label: "Máq. pesadas",
      full: "Equipamento — Máquinas pesadas",
    },
    { key: "outros", label: "Outros (EQ)", full: "Equipamento — Outros" },
    { key: "container", label: "Contêiner", full: "Equipamento — Contêiner" },
    { key: "munck", label: "Munck", full: "Equipamento — Munck" },
    { key: "guindaste", label: "Guindaste", full: "Equipamento — Guindaste" },
  ];
  for (const d of eqDefs) {
    const s = sumPair(eqBuckets[d.key]);
    out.push({
      id: `eq-${d.key}`,
      label: d.label,
      fullLabel: d.full,
      planned_value: s.p,
      actual_value: s.a,
    });
  }

  const matDefs: {
    key: keyof typeof matBuckets;
    label: string;
    full: string;
  }[] = [
    { key: "ferramental", label: "Ferramental", full: "Materiais — Ferramental" },
    {
      key: "consumiveis",
      label: "Consumíveis",
      full: "Materiais — Consumíveis",
    },
    { key: "andaime", label: "Andaime", full: "Materiais — Andaime" },
    { key: "cacamba", label: "Caçamba", full: "Materiais — Caçamba" },
    { key: "outros", label: "Outros (MAT)", full: "Materiais — Outros" },
  ];
  for (const d of matDefs) {
    const s = sumPair(matBuckets[d.key]);
    out.push({
      id: `mat-${d.key}`,
      label: d.label,
      fullLabel: d.full,
      planned_value: s.p,
      actual_value: s.a,
    });
  }

  return out;
}
