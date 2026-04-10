import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { getErrorMessage } from "../lib/supabaseError";
import { formatBRL } from "../lib/money";
import { normalizeStatus } from "../lib/statusLabels";
import type { ActivityRow, GroupRow, SubgroupRow } from "../lib/dashboardTypes";
import { classifyEquip } from "../lib/dashboardSubgroupChartBuckets";
import { DashboardSkeleton } from "../components/dashboard/DashboardSkeleton";
import { DashboardCostCharts } from "../components/dashboard/DashboardCostCharts";
import { V } from "../lib/db/catalog";

const CONTRACT_LABEL =
  (import.meta.env.VITE_CONTRACT_LABEL as string | undefined)?.trim() ||
  "Contrato";

const MAIN_ECON_TOPICS = ["Mão de Obra", "Equipamento", "Materiais"] as const;
type TopicFilter = "all" | (typeof MAIN_ECON_TOPICS)[number] | "outros";

function matchesTopicFilter(groupName: string, topic: TopicFilter): boolean {
  if (topic === "all") return true;
  if (topic === "outros") {
    return !MAIN_ECON_TOPICS.includes(
      groupName as (typeof MAIN_ECON_TOPICS)[number],
    );
  }
  return groupName === topic;
}

function KpiIconWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-lg bg-(--accent-soft) text-(--accent)"
      aria-hidden
    >
      {children}
    </div>
  );
}

/** Itens só no contrato: o que não é 6.1.1 soma em Mão de Obra; 6.1.1 vai para Equipamento → máquinas pesadas. */
const MERGE_ORPHAN_INTO_GROUP = "Mão de Obra";
const EQUIPAMENTO_GROUP = "Equipamento";
const MAQUINAS_PESADAS_SUBGROUP = "Máquinas pesadas";
const OUTROS_SO_CONTRATO = "Outros (só no contrato)";
/** Item só no contrato (6.1.1), alocado em Equipamento / máquinas pesadas. */
const DETAIL_ORPHAN_ITEM_CODE = "6.1.1";

function isDetailOrphanItem(o: ActivityRow): boolean {
  return (o.item_code ?? "").trim() === DETAIL_ORPHAN_ITEM_CODE;
}

function recalcGroupMetrics(
  planned: number,
  actual: number,
): Pick<GroupRow, "balance" | "percent_used" | "status"> {
  const balance = planned - actual;
  const percent_used = planned > 0 ? actual / planned : null;
  let status: string;
  if (actual > planned) status = "OVERBUDGET";
  else if (actual >= planned * 0.9) status = "HIGH_USAGE";
  else if (actual >= planned * 0.7) status = "WARNING";
  else status = "OK";
  return { balance, percent_used, status };
}

type GroupSortCol =
  | "group_name"
  | "planned_value"
  | "actual_value"
  | "balance"
  | "percent_used";
type SubgroupSortCol =
  | "group_name"
  | "subgroup_name"
  | "planned_value"
  | "actual_value"
  | "balance"
  | "percent_used";

function downloadCsv(
  name: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const esc = (c: string | number) => {
    const s = String(c);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Dashboard() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [subgroups, setSubgroups] = useState<SubgroupRow[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [contractOnlyLines, setContractOnlyLines] = useState<ActivityRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());
  const [detailTab, setDetailTab] = useState<"group" | "subgroup">("group");
  const [filterQuery, setFilterQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState<TopicFilter>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortGroup, setSortGroup] = useState<{
    col: GroupSortCol;
    asc: boolean;
  }>({
    col: "group_name",
    asc: true,
  });
  const [sortSubgroup, setSortSubgroup] = useState<{
    col: SubgroupSortCol;
    asc: boolean;
  }>({
    col: "group_name",
    asc: true,
  });

  useEffect(() => {
    let ok = true;
    (async () => {
      setLoadError(null);
      setLoading(true);
      try {
        const [g, sg, a] = await Promise.all([
          supabase.from(V.cost_group_summary).select("*").order("group_name"),
          supabase
            .from(V.cost_subgroup_summary)
            .select("*")
            .order("group_name")
            .order("subgroup_name"),
          supabase.from(V.cost_activity_analysis).select("*"),
        ]);
        if (g.error) throw g.error;
        if (sg.error) throw sg.error;
        if (a.error) throw a.error;
        if (!ok) return;
        setGroups((g.data ?? []) as GroupRow[]);
        setSubgroups((sg.data ?? []) as SubgroupRow[]);
        setActivities((a.data ?? []) as ActivityRow[]);
        setLoadedAt(new Date());

        const co = await supabase
          .from(V.cost_contract_only_items)
          .select("*")
          .order("item_code");
        if (!co.error) {
          setContractOnlyLines((co.data ?? []) as ActivityRow[]);
        } else {
          setContractOnlyLines([]);
        }
      } catch (e: unknown) {
        if (ok) setLoadError(getErrorMessage(e));
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => {
      ok = false;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const groupsMerged = useMemo(() => {
    const outrosRow = groups.find((g) => g.group_name === OUTROS_SO_CONTRATO);
    const withoutOutros = groups.filter(
      (g) => g.group_name !== OUTROS_SO_CONTRATO,
    );

    const sum611 = contractOnlyLines
      .filter(isDetailOrphanItem)
      .reduce(
        (acc, o) => ({
          p: acc.p + Number(o.planned_value),
          a: acc.a + Number(o.actual_value),
        }),
        { p: 0, a: 0 },
      );
    const sumEx611 = contractOnlyLines
      .filter((o) => !isDetailOrphanItem(o))
      .reduce(
        (acc, o) => ({
          p: acc.p + Number(o.planned_value),
          a: acc.a + Number(o.actual_value),
        }),
        { p: 0, a: 0 },
      );

    let addP_MO = 0;
    let addA_MO = 0;
    let addP_EQ = 0;
    let addA_EQ = 0;

    if (contractOnlyLines.length > 0) {
      addP_MO = sumEx611.p;
      addA_MO = sumEx611.a;
      addP_EQ = sum611.p;
      addA_EQ = sum611.a;
    } else if (outrosRow) {
      addP_MO = Number(outrosRow.planned_value);
      addA_MO = Number(outrosRow.actual_value);
    }

    if (
      addP_MO === 0 &&
      addA_MO === 0 &&
      addP_EQ === 0 &&
      addA_EQ === 0
    ) {
      return withoutOutros;
    }

    return withoutOutros.map((g) => {
      if (g.group_name === MERGE_ORPHAN_INTO_GROUP) {
        const p = Number(g.planned_value) + addP_MO;
        const a = Number(g.actual_value) + addA_MO;
        const m = recalcGroupMetrics(p, a);
        return {
          ...g,
          planned_value: p,
          actual_value: a,
          balance: m.balance,
          percent_used: m.percent_used,
          status: m.status,
        };
      }
      if (g.group_name === EQUIPAMENTO_GROUP && addP_EQ + addA_EQ > 0) {
        const p = Number(g.planned_value) + addP_EQ;
        const a = Number(g.actual_value) + addA_EQ;
        const m = recalcGroupMetrics(p, a);
        return {
          ...g,
          planned_value: p,
          actual_value: a,
          balance: m.balance,
          percent_used: m.percent_used,
          status: m.status,
        };
      }
      return g;
    });
  }, [groups, contractOnlyLines]);

  const totalsPrimary = useMemo(() => {
    let p = 0;
    let ac = 0;
    for (const g of groupsMerged) {
      p += Number(g.planned_value);
      ac += Number(g.actual_value);
    }
    const bal = p - ac;
    return {
      planned: p,
      actual: ac,
      balance: bal,
      pct: p > 0 ? ac / p : null,
    };
  }, [groupsMerged]);

  const totalsContract = useMemo(() => {
    let p = 0;
    let ac = 0;
    for (const r of activities) {
      p += Number(r.planned_value);
      ac += Number(r.actual_value);
    }
    const bal = p - ac;
    return {
      planned: p,
      actual: ac,
      balance: bal,
      pct: p > 0 ? ac / p : null,
    };
  }, [activities]);

  /**
   * KPIs do topo: previsto = contrato (grupo Total na planilha).
   * Real = quebra MO/EQ/MAT, onde os lançamentos são registrados — alinha com a tabela por grupo.
   */
  const totalsKpi = useMemo(() => {
    const planned = totalsContract.planned;
    const actual = totalsPrimary.actual;
    const balance = planned - actual;
    return {
      planned,
      actual,
      balance,
      pct: planned > 0 ? actual / planned : null,
    };
  }, [totalsContract.planned, totalsPrimary.actual]);

  /**
   * Item 6.1.1 (só contrato) sai do subgrupo Mão de Obra e entra em
   * Equipamento → máquinas pesadas.
   */
  const subgroupsAdjusted = useMemo(() => {
    const line = contractOnlyLines.find(isDetailOrphanItem);
    if (!line) return subgroups;

    const tP = Number(line.planned_value);
    const tA = Number(line.actual_value);

    const patch = (row: SubgroupRow, p: number, a: number): SubgroupRow => {
      const m = recalcGroupMetrics(p, a);
      return {
        ...row,
        planned_value: p,
        actual_value: a,
        balance: m.balance,
        percent_used: m.percent_used,
        status: m.status,
      };
    };

    const list = subgroups.map((s) => {
      if (
        s.group_name === MERGE_ORPHAN_INTO_GROUP &&
        s.subgroup_name === MERGE_ORPHAN_INTO_GROUP
      ) {
        const np = Math.max(0, Number(s.planned_value) - tP);
        const na = Math.max(0, Number(s.actual_value) - tA);
        return patch(s, np, na);
      }
      return s;
    });

    const idx = list.findIndex(
      (s) =>
        s.group_name === EQUIPAMENTO_GROUP &&
        classifyEquip(s.subgroup_name) === "maquinas",
    );

    if (idx >= 0) {
      const s = list[idx]!;
      return list.map((row, i) =>
        i === idx
          ? patch(
              s,
              Number(s.planned_value) + tP,
              Number(s.actual_value) + tA,
            )
          : row,
      );
    }

    const m = recalcGroupMetrics(tP, tA);
    return [
      ...list,
      {
        group_name: EQUIPAMENTO_GROUP,
        subgroup_name: MAQUINAS_PESADAS_SUBGROUP,
        planned_value: tP,
        actual_value: tA,
        balance: m.balance,
        percent_used: m.percent_used,
        status: line.status ?? m.status,
      } as SubgroupRow,
    ];
  }, [subgroups, contractOnlyLines]);

  const q = filterQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    let r = groupsMerged.filter((g) => {
      if (!q) return true;
      if (g.group_name.toLowerCase().includes(q)) return true;
      if (g.group_name === MERGE_ORPHAN_INTO_GROUP) {
        const row = contractOnlyLines.find(isDetailOrphanItem);
        if (!row) return false;
        const code = (row.item_code ?? "").toLowerCase();
        const name = row.item_name.toLowerCase();
        return code.includes(q) || name.includes(q);
      }
      if (g.group_name === EQUIPAMENTO_GROUP) {
        const row = contractOnlyLines.find(isDetailOrphanItem);
        if (!row) return false;
        const code = (row.item_code ?? "").toLowerCase();
        const name = row.item_name.toLowerCase();
        return code.includes(q) || name.includes(q);
      }
      return false;
    });
    if (statusFilter !== "all") {
      r = r.filter((g) => normalizeStatus(g.status) === statusFilter);
    }
    if (topicFilter !== "all") {
      r = r.filter((g) => matchesTopicFilter(g.group_name, topicFilter));
    }
    return r;
  }, [groupsMerged, q, statusFilter, topicFilter, contractOnlyLines]);

  const filteredSubgroups = useMemo(() => {
    let r = subgroupsAdjusted.filter(
      (s) =>
        !q ||
        s.group_name.toLowerCase().includes(q) ||
        s.subgroup_name.toLowerCase().includes(q),
    );
    if (statusFilter !== "all") {
      r = r.filter((s) => normalizeStatus(s.status) === statusFilter);
    }
    if (topicFilter !== "all") {
      r = r.filter((s) => matchesTopicFilter(s.group_name, topicFilter));
    }
    return r;
  }, [subgroupsAdjusted, q, statusFilter, topicFilter]);

  const sortedGroups = useMemo(() => {
    const { col, asc } = sortGroup;
    const copy = [...filteredGroups];
    const num = (r: GroupRow, c: GroupSortCol) => {
      switch (c) {
        case "planned_value":
          return Number(r.planned_value);
        case "actual_value":
          return Number(r.actual_value);
        case "balance":
          return Number(r.balance);
        case "percent_used":
          return r.percent_used != null ? Number(r.percent_used) : -1;
        default:
          return r.group_name;
      }
    };
    copy.sort((a, b) => {
      const va = num(a, col);
      const vb = num(b, col);
      if (typeof va === "string" && typeof vb === "string") {
        const c = va.localeCompare(vb, "pt-BR");
        return asc ? c : -c;
      }
      const na = va as number;
      const nb = vb as number;
      return asc ? na - nb : nb - na;
    });
    return copy;
  }, [filteredGroups, sortGroup]);

  const orphan611ForTable = useMemo(() => {
    let r = contractOnlyLines.filter(isDetailOrphanItem);
    if (statusFilter !== "all") {
      r = r.filter((o) => normalizeStatus(o.status) === statusFilter);
    }
    if (q) {
      r = r.filter((o) => {
        const code = (o.item_code ?? "").toLowerCase();
        const name = o.item_name.toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }
    return r;
  }, [contractOnlyLines, q, statusFilter]);

  const groupTableRows = useMemo(() => {
    type Entry =
      | { kind: "group"; row: GroupRow }
      | { kind: "orphan611"; row: ActivityRow };
    const out: Entry[] = [];
    for (const g of sortedGroups) {
      out.push({ kind: "group", row: g });
      if (
        g.group_name === EQUIPAMENTO_GROUP &&
        orphan611ForTable.length > 0
      ) {
        for (const o of orphan611ForTable) {
          out.push({ kind: "orphan611", row: o });
        }
      }
    }
    return out;
  }, [sortedGroups, orphan611ForTable]);

  const sortedSubgroups = useMemo(() => {
    const { col, asc } = sortSubgroup;
    const copy = [...filteredSubgroups];
    const num = (r: SubgroupRow, c: SubgroupSortCol) => {
      switch (c) {
        case "planned_value":
          return Number(r.planned_value);
        case "actual_value":
          return Number(r.actual_value);
        case "balance":
          return Number(r.balance);
        case "percent_used":
          return r.percent_used != null ? Number(r.percent_used) : -1;
        case "subgroup_name":
          return r.subgroup_name;
        default:
          return r.group_name;
      }
    };
    copy.sort((a, b) => {
      const va = num(a, col);
      const vb = num(b, col);
      if (typeof va === "string" && typeof vb === "string") {
        const c = va.localeCompare(vb, "pt-BR");
        return asc ? c : -c;
      }
      const na = va as number;
      const nb = vb as number;
      return asc ? na - nb : nb - na;
    });
    return copy;
  }, [filteredSubgroups, sortSubgroup]);

  const footerGroups = useMemo(() => {
    let p = 0;
    let a = 0;
    for (const r of sortedGroups) {
      p += Number(r.planned_value);
      a += Number(r.actual_value);
    }
    return { planned: p, actual: a, balance: p - a };
  }, [sortedGroups]);

  const footerSubgroups = useMemo(() => {
    let p = 0;
    let a = 0;
    for (const r of sortedSubgroups) {
      p += Number(r.planned_value);
      a += Number(r.actual_value);
    }
    return { planned: p, actual: a, balance: p - a };
  }, [sortedSubgroups]);

  const toggleGroupSort = (col: GroupSortCol) => {
    setSortGroup((s) =>
      s.col === col ? { col, asc: !s.asc } : { col, asc: col === "group_name" },
    );
  };

  const toggleSubgroupSort = (col: SubgroupSortCol) => {
    setSortSubgroup((s) =>
      s.col === col
        ? { col, asc: !s.asc }
        : { col, asc: col === "group_name" || col === "subgroup_name" },
    );
  };

  const exportDetailCsv = () => {
    if (detailTab === "group") {
      const lines: (string | number)[][] = [];
      for (const e of groupTableRows) {
        if (e.kind === "group") {
          const r = e.row;
          lines.push([
            r.group_name,
            formatBRL(r.planned_value),
            formatBRL(r.actual_value),
            formatBRL(r.balance),
            r.percent_used != null
              ? `${(Number(r.percent_used) * 100).toFixed(1)}%`
              : "—",
          ]);
        } else {
          const r = e.row;
          lines.push([
            `↳ ${r.item_code ?? "—"} — ${r.item_name}`,
            formatBRL(r.planned_value),
            formatBRL(r.actual_value),
            formatBRL(r.balance),
            r.percent_used != null
              ? `${(Number(r.percent_used) * 100).toFixed(1)}%`
              : "—",
          ]);
        }
      }
      downloadCsv(
        "dashboard-grupos.csv",
        ["Grupo", "Previsto", "Real", "Saldo", "%"],
        lines,
      );
    } else if (detailTab === "subgroup") {
      downloadCsv(
        "dashboard-subgrupos.csv",
        ["Grupo", "Subgrupo", "Previsto", "Real", "Saldo", "%"],
        sortedSubgroups.map((r) => [
          r.group_name,
          r.subgroup_name,
          formatBRL(r.planned_value),
          formatBRL(r.actual_value),
          formatBRL(r.balance),
          r.percent_used != null
            ? `${(Number(r.percent_used) * 100).toFixed(1)}%`
            : "—",
        ]),
      );
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const pctOfPlanned = (part: number) =>
    totalsKpi.planned > 0 ? (part / totalsKpi.planned) * 100 : null;

  return (
    <div className="space-y-8">
      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-red-900/40 bg-red-950/50 px-4 py-3 text-sm text-red-100"
        >
          <p className="font-medium">Não foi possível carregar os dados</p>
          <p className="mt-1 opacity-90">{loadError}</p>
        </div>
      )}
      <div className="flex flex-col gap-4 border-b border-(--border) pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-(--text)">
              Controle Operacional
            </h1>
            <p className="mt-1 text-sm text-(--muted)">
              Dashboard de custos da obra · {CONTRACT_LABEL}
            </p>
          </div>
        </div>
        {loadedAt && (
          <div className="shrink-0 rounded-xl border border-(--border) bg-(--card) px-4 py-3 text-xs text-(--muted) shadow-(--shadow-card)">
            <div className="font-medium text-(--text)">Atualizado</div>
            <div className="mt-1 tabular-nums text-(--text)">
              {nowTick.toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>

      <section className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative overflow-hidden rounded-xl border border-(--border) bg-(--card) p-4 pr-14 shadow-(--shadow-card)">
            <KpiIconWrap>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1h4a1 1 0 0 1-1 1h-1" />
                <path d="M3 11v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
              </svg>
            </KpiIconWrap>
            <div className="text-xs font-medium tracking-wide text-(--muted)">
              Custo total previsto
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-(--text)">
              {formatBRL(totalsKpi.planned)}
            </div>
            <p className="mt-1 text-xs text-(--muted)">
              {totalsKpi.planned > 0 ? "100% da base contratual" : "—"}
            </p>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-(--border) bg-(--card) p-4 pr-14 shadow-(--shadow-card)">
            <KpiIconWrap>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </KpiIconWrap>
            <div className="text-xs font-medium tracking-wide text-(--muted)">
              Total real (lançamentos)
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-(--text)">
              {formatBRL(totalsKpi.actual)}
            </div>
            <p className="mt-1 text-xs text-(--muted)">
              {pctOfPlanned(totalsKpi.actual) != null
                ? `${pctOfPlanned(totalsKpi.actual)!.toFixed(1)}% do previsto`
                : "—"}
            </p>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-(--border) bg-(--card) p-4 pr-14 shadow-(--shadow-card)">
            <KpiIconWrap>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
                <path d="M7 21h10" />
                <path d="M12 3v18" />
                <path d="M3 7h2c2 0 4 0 4 3 0 4-4 3-4 6" />
                <path d="M21 7h-2c-2 0-4 0-4 3 0 4 4 3 4 6" />
              </svg>
            </KpiIconWrap>
            <div className="text-xs font-medium tracking-wide text-(--muted)">
              Saldo
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-(--text)">
              {formatBRL(totalsKpi.balance)}
            </div>
            <p className="mt-1 text-xs text-(--muted)">
              {pctOfPlanned(totalsKpi.balance) != null
                ? `${pctOfPlanned(totalsKpi.balance)!.toFixed(1)}% do previsto`
                : "—"}
            </p>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-(--border) bg-(--card) p-4 pr-14 shadow-(--shadow-card)">
            <KpiIconWrap>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg>
            </KpiIconWrap>
            <div className="text-xs font-medium tracking-wide text-(--muted)">
              % consumido
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-(--text)">
              {totalsKpi.pct != null
                ? `${(totalsKpi.pct * 100).toFixed(2)}%`
                : "—"}
            </div>
            <p className="mt-1 text-xs text-(--muted)">
              {totalsKpi.pct != null
                ? "Real ÷ previsto (contrato)"
                : "—"}
            </p>
          </div>
        </div>
      </section>

      <DashboardCostCharts subgroups={subgroupsAdjusted} />

      <section className="space-y-4 rounded-xl border border-(--border) bg-(--card) p-5 shadow-(--shadow-card)">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-(--text)">
              Tópicos e valores
            </h2>
            <p className="mt-1 text-xs text-(--muted)">
              Filtre por tópico, texto e status; exporte para CSV.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                detailTab === "group"
                  ? "bg-(--accent-soft) text-(--accent) ring-1 ring-(--accent)/30"
                  : "border border-(--border) bg-(--input-bg) text-(--text) hover:bg-(--nav-hover)"
              }`}
              onClick={() => setDetailTab("group")}
            >
              Por grupo
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                detailTab === "subgroup"
                  ? "bg-(--accent-soft) text-(--accent) ring-1 ring-(--accent)/30"
                  : "border border-(--border) bg-(--input-bg) text-(--text) hover:bg-(--nav-hover)"
              }`}
              onClick={() => setDetailTab("subgroup")}
            >
              Por subgrupo
            </button>
            <button
              type="button"
              className="rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm font-medium text-(--text) hover:bg-(--nav-hover)"
              onClick={exportDetailCsv}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-50 flex-1 flex-col gap-1.5 text-xs font-medium text-(--muted)">
            Buscar
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Grupo, subgrupo ou código"
              className="rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text) placeholder:text-(--muted)/70"
            />
          </label>
          <label className="flex w-full min-w-44 flex-col gap-1.5 text-xs font-medium text-(--muted) sm:w-auto">
            Tópico
            <select
              value={topicFilter}
              onChange={(e) =>
                setTopicFilter(e.target.value as TopicFilter)
              }
              className="rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text)"
            >
              <option value="all">Todos</option>
              <option value="Mão de Obra">Mão de Obra</option>
              <option value="Equipamento">Equipamento</option>
              <option value="Materiais">Materiais</option>
              <option value="outros">Demais grupos</option>
            </select>
          </label>
          <label className="flex w-full min-w-44 flex-col gap-1.5 text-xs font-medium text-(--muted) sm:w-auto">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text)"
            >
              <option value="all">Todos</option>
              <option value="OVERBUDGET">Acima do orçado</option>
              <option value="HIGH_USAGE">Alto uso (≥90%)</option>
              <option value="WARNING">Atenção (70–90%)</option>
              <option value="OK">No orçamento</option>
            </select>
          </label>
        </div>

        {detailTab === "group" && (
          <div className="mt-4 max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-(--border) bg-(--input-bg)">
            <table className="w-full min-w-160 text-sm">
              <thead className="sticky top-0 z-10 border-b border-(--border) bg-(--table-header-bg)">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleGroupSort("group_name")}
                    >
                      Grupo{" "}
                      {sortGroup.col === "group_name"
                        ? sortGroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleGroupSort("planned_value")}
                    >
                      Previsto{" "}
                      {sortGroup.col === "planned_value"
                        ? sortGroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleGroupSort("actual_value")}
                    >
                      Real{" "}
                      {sortGroup.col === "actual_value"
                        ? sortGroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleGroupSort("balance")}
                    >
                      Saldo{" "}
                      {sortGroup.col === "balance"
                        ? sortGroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleGroupSort("percent_used")}
                    >
                      %{" "}
                      {sortGroup.col === "percent_used"
                        ? sortGroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupTableRows.map((e) =>
                  e.kind === "group" ? (
                    <tr
                      key={e.row.group_name}
                      className="border-b border-(--border) last:border-0"
                    >
                      <td className="px-3 py-2 font-medium">
                        {e.row.group_name}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatBRL(e.row.planned_value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatBRL(e.row.actual_value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatBRL(e.row.balance)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {e.row.percent_used != null
                          ? `${(Number(e.row.percent_used) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={`orphan-${e.row.item_id}`}
                      className="border-b border-(--border) last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div className="ml-2 flex items-start gap-2.5 border-l-2 border-(--donut-eq)/45 pl-3">
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-(--donut-eq) shadow-[0_0_10px_rgba(45,212,191,0.35)]"
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="font-mono text-xs font-semibold text-(--accent)">
                                {e.row.item_code ?? "—"}
                              </span>
                              <span className="text-sm leading-snug text-(--text)">
                                {e.row.item_name}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-(--muted)">
                        {formatBRL(e.row.planned_value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-(--muted)">
                        {formatBRL(e.row.actual_value)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-(--muted)">
                        {formatBRL(e.row.balance)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-(--muted)">
                        {e.row.percent_used != null
                          ? `${(Number(e.row.percent_used) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 border-t border-(--border) bg-(--table-footer-bg) font-medium">
                <tr>
                  <td className="px-4 py-3">Total (visível)</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerGroups.planned)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerGroups.actual)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerGroups.balance)}
                  </td>
                  <td className="px-4 py-3 text-right text-(--muted)">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {detailTab === "subgroup" && (
          <div className="mt-4 max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-(--border) bg-(--input-bg)">
            <table className="w-full min-w-180 text-sm">
              <thead className="sticky top-0 z-10 border-b border-(--border) bg-(--table-header-bg)">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("group_name")}
                    >
                      Grupo{" "}
                      {sortSubgroup.col === "group_name"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("subgroup_name")}
                    >
                      Subgrupo{" "}
                      {sortSubgroup.col === "subgroup_name"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("planned_value")}
                    >
                      Previsto{" "}
                      {sortSubgroup.col === "planned_value"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("actual_value")}
                    >
                      Real{" "}
                      {sortSubgroup.col === "actual_value"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("balance")}
                    >
                      Saldo{" "}
                      {sortSubgroup.col === "balance"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium tracking-wide text-(--muted) uppercase">
                    <button
                      type="button"
                      className="font-medium text-(--muted) hover:text-(--text) hover:underline"
                      onClick={() => toggleSubgroupSort("percent_used")}
                    >
                      %{" "}
                      {sortSubgroup.col === "percent_used"
                        ? sortSubgroup.asc
                          ? "↑"
                          : "↓"
                        : ""}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSubgroups.map((r) => (
                  <tr
                    key={`${r.group_name}-${r.subgroup_name}`}
                    className="border-b border-(--border) last:border-0"
                  >
                    <td className="px-3 py-2 align-top font-medium">
                      {r.group_name}
                    </td>
                    <td className="min-w-55 max-w-md wrap-break-word px-3 py-2 align-top">
                      {r.subgroup_name}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {formatBRL(r.planned_value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {formatBRL(r.actual_value)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {formatBRL(r.balance)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums align-top">
                      {r.percent_used != null
                        ? `${(Number(r.percent_used) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 border-t border-(--border) bg-(--table-footer-bg) font-medium">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>
                    Total (visível)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerSubgroups.planned)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerSubgroups.actual)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatBRL(footerSubgroups.balance)}
                  </td>
                  <td className="px-4 py-3 text-right text-(--muted)">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
