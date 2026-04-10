import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { getErrorMessage } from "../lib/supabaseError";
import { formatBRL } from "../lib/money";
import { normalizeStatus } from "../lib/statusLabels";
import type { ActivityRow, GroupRow, SubgroupRow } from "../lib/dashboardTypes";
import { DashboardSkeleton } from "../components/dashboard/DashboardSkeleton";
import { DashboardTopSubgroupsChart } from "../components/dashboard/DashboardTopSubgroupsChart";
import { V } from "../lib/db/catalog";

const CONTRACT_LABEL =
  (import.meta.env.VITE_CONTRACT_LABEL as string | undefined)?.trim() ||
  "Contrato";

/** Itens só no Total somam em Mão de Obra; no detalhe só exibimos o código abaixo. */
const MERGE_ORPHAN_INTO_GROUP = "Mão de Obra";
const OUTROS_SO_CONTRATO = "Outros (só no contrato)";
/** Única sublinha de item (contrato) mostrada em Por grupo, sob Mão de Obra. */
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
    const fromLines = contractOnlyLines.reduce(
      (acc, o) => ({
        p: acc.p + Number(o.planned_value),
        a: acc.a + Number(o.actual_value),
      }),
      { p: 0, a: 0 },
    );
    let addP = 0;
    let addA = 0;
    if (contractOnlyLines.length > 0) {
      addP = fromLines.p;
      addA = fromLines.a;
    } else if (outrosRow) {
      addP = Number(outrosRow.planned_value);
      addA = Number(outrosRow.actual_value);
    }
    const withoutOutros = groups.filter(
      (g) => g.group_name !== OUTROS_SO_CONTRATO,
    );
    if (addP === 0 && addA === 0) return withoutOutros;
    return withoutOutros.map((g) => {
      if (g.group_name !== MERGE_ORPHAN_INTO_GROUP) return g;
      const p = Number(g.planned_value) + addP;
      const a = Number(g.actual_value) + addA;
      const m = recalcGroupMetrics(p, a);
      return {
        ...g,
        planned_value: p,
        actual_value: a,
        balance: m.balance,
        percent_used: m.percent_used,
        status: m.status,
      };
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
      return false;
    });
    if (statusFilter !== "all") {
      r = r.filter((g) => normalizeStatus(g.status) === statusFilter);
    }
    return r;
  }, [groupsMerged, q, statusFilter, contractOnlyLines]);

  const filteredSubgroups = useMemo(() => {
    let r = subgroups.filter(
      (s) =>
        !q ||
        s.group_name.toLowerCase().includes(q) ||
        s.subgroup_name.toLowerCase().includes(q),
    );
    if (statusFilter !== "all") {
      r = r.filter((s) => normalizeStatus(s.status) === statusFilter);
    }
    return r;
  }, [subgroups, q, statusFilter]);

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
        g.group_name === MERGE_ORPHAN_INTO_GROUP &&
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

  return (
    <div className="space-y-10">
      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
        >
          <p className="font-medium">Não foi possível carregar os dados</p>
          <p className="mt-1 opacity-90">{loadError}</p>
        </div>
      )}
      <div className="flex flex-col gap-3 border-b border-(--border) pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-(--text)">
            Visão do {CONTRACT_LABEL} — orçado × realizado
          </h1>
        </div>
        <div className="shrink-0 rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-xs text-(--muted)">
          <div className="font-medium text-(--text)">{CONTRACT_LABEL}</div>
          {loadedAt && (
            <div className="mt-0.5 space-y-0.5">
              <div></div>
              <div className="tabular-nums text-(--text)">
                Agora{" "}
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
      </div>

      <section className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-(--muted)">
              Total previsto (contrato)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totalsKpi.planned)}
            </div>
          </div>
          <div className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-(--muted)">
              Total real (lançamentos)
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totalsKpi.actual)}
            </div>
          </div>
          <div className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-(--muted)">
              Saldo
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totalsKpi.balance)}
            </div>
          </div>
          <div className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-(--muted)">
              % consumido
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {totalsKpi.pct != null
                ? `${(totalsKpi.pct * 100).toFixed(2)}%`
                : "—"}
            </div>
          </div>
        </div>
      </section>

      <DashboardTopSubgroupsChart subgroups={subgroups} />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Detalhamento</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                detailTab === "group"
                  ? "bg-(--accent-soft) text-(--accent) ring-1 ring-(--accent)/30"
                  : "border border-(--border) bg-(--card) text-(--text) hover:bg-slate-800/70 dark:hover:bg-slate-800/80"
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
                  : "border border-(--border) bg-(--card) text-(--text) hover:bg-slate-800/70 dark:hover:bg-slate-800/80"
              }`}
              onClick={() => setDetailTab("subgroup")}
            >
              Por subgrupo
            </button>
            <button
              type="button"
              className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm font-medium text-(--text) hover:bg-slate-800/70 dark:hover:bg-slate-800/80"
              onClick={exportDetailCsv}
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex min-w-50 flex-1 flex-col gap-1 text-xs font-medium text-(--muted)">
            Buscar
            <input
              type="search"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Nome do grupo ou 6.1.1"
              className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
            />
          </label>
          <label className="flex w-full min-w-45 flex-col gap-1 text-xs font-medium text-(--muted) sm:w-auto">
            Status
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
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
          <div className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-(--border) bg-(--card)">
            <table className="w-full min-w-160 text-sm">
              <thead className="sticky top-0 z-10 border-b border-(--border) bg-slate-50 dark:bg-slate-800/95">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                {groupTableRows.map((e, i) =>
                  e.kind === "group" ? (
                    <tr
                      key={e.row.group_name}
                      className={`border-b border-(--border) last:border-0 ${
                        i % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                      }`}
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
                      className={`border-b border-(--border) last:border-0 ${
                        i % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="ml-2 border-l-2 border-(--accent)/35 pl-3">
                          <div className="font-mono text-xs font-medium text-(--accent)">
                            {e.row.item_code ?? "—"}
                          </div>
                          <div className="mt-0.5 text-xs leading-snug text-(--muted)">
                            {e.row.item_name}
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
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-(--border) bg-slate-100/95 font-medium dark:bg-slate-900/95">
                <tr>
                  <td className="px-3 py-2">Total (visível)</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerGroups.planned)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerGroups.actual)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerGroups.balance)}
                  </td>
                  <td className="px-3 py-2 text-right text-(--muted)">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {detailTab === "subgroup" && (
          <div className="max-h-[min(70vh,640px)] overflow-auto rounded-xl border border-(--border) bg-(--card)">
            <table className="w-full min-w-180 text-sm">
              <thead className="sticky top-0 z-10 border-b border-(--border) bg-slate-50 dark:bg-slate-800/95">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                  <th className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-medium hover:underline"
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
                {sortedSubgroups.map((r, i) => (
                  <tr
                    key={`${r.group_name}-${r.subgroup_name}`}
                    className={`border-b border-(--border) last:border-0 ${
                      i % 2 === 1 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""
                    }`}
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
              <tfoot className="sticky bottom-0 z-10 border-t-2 border-(--border) bg-slate-100/95 font-medium dark:bg-slate-900/95">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>
                    Total (visível)
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerSubgroups.planned)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerSubgroups.actual)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(footerSubgroups.balance)}
                  </td>
                  <td className="px-3 py-2 text-right text-(--muted)">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
