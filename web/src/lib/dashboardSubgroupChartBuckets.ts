import type { SubgroupRow } from "./dashboardTypes";
import {
  foldSubgroupKey,
  formatSubgroupLabelForDisplay,
} from "./mergeSubgroups";

export type SubgroupChartBar = {
  id: string;
  /** Texto curto no eixo */
  label: string;
  /** Tooltip / acessibilidade */
  fullLabel: string;
  planned_value: number;
  actual_value: number;
};

function sumPair(rows: SubgroupRow[]): { p: number; a: number } {
  let p = 0;
  let a = 0;
  for (const r of rows) {
    p += Number(r.planned_value);
    a += Number(r.actual_value);
  }
  return { p, a };
}

/** Soma prevista por grupo (para donut de distribuição). */
export function buildCostDistributionQuad(rows: SubgroupRow[]): {
  mo: number;
  eq: number;
  mat: number;
  forn: number;
} {
  let mo = 0;
  let eq = 0;
  let mat = 0;
  let forn = 0;
  for (const r of rows) {
    const v = Number(r.planned_value);
    if (r.group_name === "Mão de Obra") mo += v;
    else if (r.group_name === "Equipamento") eq += v;
    else if (r.group_name === "Materiais") mat += v;
    else if (r.group_name === "Fornecimento") forn += v;
  }
  return { mo, eq, mat, forn };
}

function sortBarsByPlannedDesc(bars: SubgroupChartBar[]): SubgroupChartBar[] {
  return [...bars].sort((a, b) => b.planned_value - a.planned_value);
}

/** Id estável e único por chave dobrada (evita colisão de slug e keys React duplicadas). */
function barIdFromFolded(idPrefix: string, folded: string): string {
  if (folded === "—") return `${idPrefix}-emdash`;
  let h = 2166136261;
  for (let i = 0; i < folded.length; i++) {
    h ^= folded.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${idPrefix}-k${(h >>> 0).toString(16)}-${folded.length}`;
}

/**
 * Barras horizontais por subgrupo (nome normalizado), maior previsto primeiro.
 * Usado para Equipamento, Materiais e Fornecimento.
 */
function buildHorizontalBarsForGroup(
  rows: SubgroupRow[],
  groupName: string,
  idPrefix: string,
  fullLabelPrefix: string,
): SubgroupChartBar[] {
  const filtered = rows.filter((r) => r.group_name === groupName);
  const byFold = new Map<string, { planned: number; actual: number }>();
  for (const r of filtered) {
    const raw = (r.subgroup_name || "—").trim() || "—";
    const folded = foldSubgroupKey(raw);
    const cur = byFold.get(folded) ?? { planned: 0, actual: 0 };
    cur.planned += Number(r.planned_value);
    cur.actual += Number(r.actual_value);
    byFold.set(folded, cur);
  }
  const bars: SubgroupChartBar[] = [];
  for (const [folded, s] of byFold) {
    const subName =
      folded === "—" ? "—" : formatSubgroupLabelForDisplay(folded);
    bars.push({
      id: barIdFromFolded(idPrefix, folded),
      label: subName.length > 26 ? `${subName.slice(0, 24)}…` : subName,
      fullLabel: `${fullLabelPrefix} — ${subName}`,
      planned_value: s.planned,
      actual_value: s.actual,
    });
  }
  return sortBarsByPlannedDesc(bars);
}

/**
 * Equipamento: um par de barras por subgrupo (como Materiais), maior previsto primeiro.
 */
export function buildEquipmentHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  return buildHorizontalBarsForGroup(
    rows,
    "Equipamento",
    "eq-h",
    "Equipamento",
  );
}

/**
 * Materiais: um par de barras por subgrupo, maior previsto primeiro.
 */
export function buildMaterialHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  return buildHorizontalBarsForGroup(rows, "Materiais", "mat-sg", "Materiais");
}

/**
 * Fornecimento: um par de barras por subgrupo, maior previsto primeiro.
 */
export function buildFornecimentoHorizontalSeries(
  rows: SubgroupRow[],
): SubgroupChartBar[] {
  return buildHorizontalBarsForGroup(
    rows,
    "Fornecimento",
    "for-h",
    "Fornecimento",
  );
}

/**
 * Série combinada: Mão de Obra (total) + subgrupos de Equipamento, Materiais e Fornecimento.
 */
export function buildSubgroupChartSeries(rows: SubgroupRow[]): SubgroupChartBar[] {
  const mo = rows.filter((r) => r.group_name === "Mão de Obra");
  const sMo = sumPair(mo);
  const moBar: SubgroupChartBar = {
    id: "mo",
    label: "Mão de obra",
    fullLabel: "Mão de Obra (total)",
    planned_value: sMo.p,
    actual_value: sMo.a,
  };
  const eqBars = buildEquipmentHorizontalSeries(rows).map((b) => ({
    ...b,
    id: b.id.replace(/^eq-h-/, "eq-"),
  }));
  const matBars = buildMaterialHorizontalSeries(rows).map((b) => ({
    ...b,
    id: b.id.replace(/^mat-sg-/, "mat-"),
  }));
  const forBars = buildFornecimentoHorizontalSeries(rows).map((b) => ({
    ...b,
    id: b.id.replace(/^for-h-/, "for-"),
  }));
  return [moBar, ...eqBars, ...matBars, ...forBars];
}
