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

function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function classifyEquip(sub: string): "onibus" | "guindaste" | "munck" | "maquinas" | "outros" {
  const t = fold(sub);
  if (t.includes("onibus") || t.includes("nibus")) return "onibus";
  if (t.includes("munck")) return "munck";
  if (t.includes("guindaste")) return "guindaste";
  if (t.includes("maquina") && t.includes("pesad")) return "maquinas";
  return "outros";
}

function classifyMat(sub: string): "ferramental" | "consumiveis" | "andaime" | "cacamba" | "outros" {
  const t = fold(sub);
  if (t.includes("ferramental")) return "ferramental";
  if (t.includes("consumivel") || t.includes("consumi")) return "consumiveis";
  if (t.includes("andaime")) return "andaime";
  if (t.includes("cacamba") || t.includes("cancamba")) return "cacamba";
  return "outros";
}

/**
 * Série fixa para o gráfico de custos por subgrupo:
 * Mão de Obra → Equipamento (ônibus, guindaste, munck, máquinas pesadas, outros)
 * → Materiais (ferramental, consumíveis, andaime, caçamba, outros).
 */
export function buildSubgroupChartSeries(rows: SubgroupRow[]): SubgroupChartBar[] {
  const mo = rows.filter((r) => r.group_name === "Mão de Obra");
  const eq = rows.filter((r) => r.group_name === "Equipamento");
  const mat = rows.filter((r) => r.group_name === "Materiais");

  const eqBuckets: Record<
    "onibus" | "guindaste" | "munck" | "maquinas" | "outros",
    SubgroupRow[]
  > = {
    onibus: [],
    guindaste: [],
    munck: [],
    maquinas: [],
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
    key: keyof typeof eqBuckets;
    label: string;
    full: string;
  }[] = [
    { key: "onibus", label: "Ônibus", full: "Equipamento — Ônibus" },
    { key: "guindaste", label: "Guindaste", full: "Equipamento — Guindaste(s)" },
    { key: "munck", label: "Munck", full: "Equipamento — Munck" },
    {
      key: "maquinas",
      label: "Máq. pesadas",
      full: "Equipamento — Máquinas pesadas",
    },
    { key: "outros", label: "Outros (EQ)", full: "Equipamento — Outros" },
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
