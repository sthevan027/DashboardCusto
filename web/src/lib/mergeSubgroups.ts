import type { SubgroupRow } from "./dashboardTypes";

/** Chave estável para agrupar subgrupos que só diferem por maiúsculas/acentos. */
export function foldSubgroupKey(s: string): string {
  let t = s.replace(/[\uFEFF\u200B-\u200D\u2060]/g, "").trim();
  if (!t || t === "—") return "—";
  t = t
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[／﹨＼‧・]/g, "/")
    .replace(/\s*[/\\]\s*/g, "/")
    .replace(/\s+/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  return t;
}

/** Rótulo único para exibição a partir da chave dobrada (ex.: outros/consumiveis → Outros/Consumiveis). */
export function formatSubgroupLabelForDisplay(foldedKey: string): string {
  if (foldedKey === "—") return "—";
  return foldedKey
    .split("/")
    .map((seg) => {
      const x = seg.trim();
      if (!x) return x;
      return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
    })
    .join("/");
}

function deriveSubgroupMetrics(planned: number, actual: number): Pick<
  SubgroupRow,
  "balance" | "percent_used" | "status"
> {
  const balance = planned - actual;
  const percent_used = planned > 0 ? actual / planned : null;
  let status = "OK";
  if (actual > planned) status = "OVERBUDGET";
  else if (planned > 0 && actual >= planned * 0.9) status = "HIGH_USAGE";
  else if (planned > 0 && actual >= planned * 0.7) status = "WARNING";
  return { balance, percent_used, status };
}

/**
 * Junta linhas com o mesmo grupo e mesmo subgrupo após normalização (ex.: consumiveis vs Consumiveis).
 */
export function mergeSubgroupRowsCaseInsensitive(
  rows: SubgroupRow[],
): SubgroupRow[] {
  type Agg = { group_name: string; folded: string; planned: number; actual: number };
  const map = new Map<string, Agg>();

  for (const r of rows) {
    const g = r.group_name;
    const raw = (r.subgroup_name || "—").trim() || "—";
    const folded = foldSubgroupKey(raw);
    const k = `${g}\0${folded}`;
    const cur = map.get(k);
    const p = Number(r.planned_value);
    const a = Number(r.actual_value);
    if (!cur) {
      map.set(k, { group_name: g, folded, planned: p, actual: a });
    } else {
      cur.planned += p;
      cur.actual += a;
    }
  }

  const out: SubgroupRow[] = [];
  for (const v of map.values()) {
    const subgroup_name =
      v.folded === "—" ? "—" : formatSubgroupLabelForDisplay(v.folded);
    const { balance, percent_used, status } = deriveSubgroupMetrics(
      v.planned,
      v.actual,
    );
    out.push({
      group_name: v.group_name,
      subgroup_name,
      planned_value: v.planned,
      actual_value: v.actual,
      balance,
      percent_used,
      status,
    });
  }

  return out.sort(
    (a, b) =>
      a.group_name.localeCompare(b.group_name, "pt-BR") ||
      a.subgroup_name.localeCompare(b.subgroup_name, "pt-BR"),
  );
}
