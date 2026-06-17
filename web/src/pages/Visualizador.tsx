import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { T, V } from "../lib/db/catalog";
import { formatBRL, parseBRLInput } from "../lib/money";
import { replaceItemActualWithManualTotal } from "../lib/costs";
import { getErrorMessage } from "../lib/supabaseError";
import { compareGroup, compareItemCode } from "../lib/sort";
import { statusLabelPt } from "../lib/statusLabels";
import { useAuth } from "../contexts/AuthContext";
import { isStandalone } from "../lib/presentationMode";
import {
  mockVisualActivities,
  mockVisualBreakdown,
} from "../lib/presentationMockData";

type Activity = {
  item_id: number;
  item_name: string;
  planned_value: number;
  actual_value: number;
  balance: number;
  percent_used: number | null;
  status: string;
  item_code: string | null;
};

type Breakdown = {
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

export function Visual() {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin && !isStandalone();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [breakdown, setBreakdown] = useState<Breakdown[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyWithDiff, setOnlyWithDiff] = useState(false);

  const byCode = useMemo(() => {
    const m = new Map<string, Breakdown[]>();
    for (const b of breakdown) {
      const c = b.item_code ?? "";
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(b);
    }
    for (const [, arr] of m) {
      arr.sort(
        (a, b) =>
          compareGroup(a.group_name, b.group_name) ||
          (a.subgroup_name ?? "").localeCompare(b.subgroup_name ?? "", "pt-BR"),
      );
    }
    return m;
  }, [breakdown]);

  const q = query.trim().toLowerCase();

  const filteredActivities = useMemo(() => {
    let r = activities;
    if (q) {
      r = r.filter((a) => {
        const code = (a.item_code ?? "").toLowerCase();
        const name = a.item_name.toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }
    if (onlyWithDiff) {
      r = r.filter((a) => Math.abs(Number(a.planned_value) - Number(a.actual_value)) >= 0.01);
    }
    return r;
  }, [activities, q, onlyWithDiff]);

  const load = useCallback(async () => {
    setErr(null);
    if (isStandalone()) {
      setActivities(
        (mockVisualActivities as Activity[]).sort((x, y) =>
          compareItemCode(x.item_code, y.item_code),
        ),
      );
      setBreakdown(mockVisualBreakdown as Breakdown[]);
      return;
    }
    const [a, b] = await Promise.all([
      supabase.from(V.cost_activity_analysis).select("*"),
      supabase.from(V.cost_visual_breakdown).select("*"),
    ]);
    if (a.error) throw a.error;
    if (b.error) throw b.error;
    setActivities(
      ((a.data ?? []) as Activity[]).sort((x, y) =>
        compareItemCode(x.item_code, y.item_code),
      ),
    );
    setBreakdown((b.data ?? []) as Breakdown[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e: unknown) {
        setErr(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  async function savePlanned(itemId: number, raw: string) {
    if (!canEdit) return;
    const v = parseBRLInput(raw);
    if (v == null || v < 0) {
      setErr("Valor previsto inválido.");
      return;
    }
    setSaving(`p-${itemId}`);
    setErr(null);
    const { error } = await supabase
      .from(T.cost_budgets)
      .update({ planned_value: v })
      .eq("item_id", itemId);
    setSaving(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  async function saveActual(itemId: number, raw: string) {
    if (!canEdit) return;
    const v = parseBRLInput(raw);
    if (v == null || v < 0) {
      setErr("Valor real inválido.");
      return;
    }
    setSaving(`a-${itemId}`);
    setErr(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await replaceItemActualWithManualTotal(supabase, itemId, v, today);
      await load();
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  async function saveSubgroupName(subgroupId: number | null, raw: string) {
    if (!canEdit || subgroupId == null) return;
    setSaving(`sg-${subgroupId}`);
    setErr(null);
    const { error } = await supabase
      .from(T.cost_subgroups)
      .update({ name: raw.trim() })
      .eq("id", subgroupId);
    setSaving(null);
    if (error) {
      setErr(error.message);
      return;
    }
    await load();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-(--border)" />
        <div className="h-10 w-full animate-pulse rounded bg-(--border)" />
        <p className="text-sm text-(--muted)">Carregando dados…</p>
      </div>
    );
  }

  if (err && activities.length === 0) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950/40">
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-(--text)">
              Visualizador
            </h1>
            {!canEdit && (
              <span className="rounded-full border border-(--border) bg-(--app-bg) px-2.5 py-0.5 text-xs font-medium text-(--muted)">
                Só leitura
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-92">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por código ou descrição…"
              className="w-full rounded-lg border border-(--border) bg-(--input-bg) px-3 py-2 text-sm text-(--text) shadow-sm outline-none placeholder:text-(--muted) focus:ring-2 focus:ring-(--ring)"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-(--text)">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={onlyWithDiff}
              onChange={(e) => setOnlyWithDiff(e.target.checked)}
            />
            Só com diferença
          </label>
          <div className="text-xs tabular-nums text-(--muted) sm:text-right">
            {filteredActivities.length}/{activities.length}
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30">
          {err}
        </div>
      )}

      <div className="space-y-10 overflow-x-auto">
        {filteredActivities.map((act) => {
          const code = act.item_code ?? "";
          const rows = byCode.get(code) ?? [];
          return (
            <section key={act.item_id} className="min-w-180">
              <div className="overflow-hidden rounded-lg border border-(--border) bg-(--card) shadow-sm">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-(--border) bg-slate-100 dark:bg-slate-800">
                      <th className="px-2 py-2 text-left font-semibold">
                        Itens
                      </th>
                      <th className="px-2 py-2 text-left font-semibold">
                        Descrição / Sub-Grupo
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        Total previsto
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        Total real
                      </th>
                      <th className="px-2 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-(--row-orange)">
                      <td className="border-b border-(--border) px-2 py-2 font-mono text-xs">
                        {act.item_code}
                      </td>
                      <td className="border-b border-(--border) px-2 py-2 font-medium">
                        {act.item_name}
                      </td>
                      <td className="border-b border-(--border) px-2 py-2 text-right align-top">
                        <InlineMoney
                          defaultValue={act.planned_value}
                          readOnly={!canEdit}
                          disabled={!!saving}
                          onSave={(v) => savePlanned(act.item_id, v)}
                        />
                      </td>
                      <td className="border-b border-(--border) px-2 py-2 text-right align-top">
                        <InlineMoney
                          defaultValue={act.actual_value}
                          readOnly={!canEdit}
                          disabled={!!saving}
                          onSave={(v) => saveActual(act.item_id, v)}
                        />
                      </td>
                      <td className="border-b border-(--border) px-2 py-2 text-xs text-(--muted)">
                        {statusLabelPt(act.status)}
                      </td>
                    </tr>

                    {rows.map((r) => (
                      <tr
                        key={r.item_id}
                        className="bg-white dark:bg-slate-900/40"
                      >
                        <td className="border-b border-(--border) px-2 py-1.5"></td>
                        <td className="border-b border-(--border) px-2 py-1.5">
                          <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                            {r.group_name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-(--muted)">Sub:</span>
                            {canEdit ? (
                              <input
                                defaultValue={r.subgroup_name ?? ""}
                                className="max-w-70 flex-1 rounded border border-(--border) bg-(--card) px-2 py-1 text-sm"
                                disabled={r.subgroup_id == null || !!saving}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const nv = e.target.value.trim();
                                  if (
                                    nv &&
                                    nv !== (r.subgroup_name ?? "") &&
                                    r.subgroup_id
                                  ) {
                                    void saveSubgroupName(r.subgroup_id, nv);
                                  }
                                }}
                              />
                            ) : (
                              <span className="text-sm text-(--text)">
                                {(r.subgroup_name ?? "").trim() || "—"}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-(--muted) line-clamp-2">
                            {r.item_name}
                          </div>
                        </td>
                        <td className="border-b border-(--border) px-2 py-1.5 text-right align-top">
                          <InlineMoney
                            defaultValue={r.planned_value}
                            readOnly={!canEdit}
                            disabled={!!saving}
                            onSave={(v) => savePlanned(r.item_id, v)}
                          />
                        </td>
                        <td className="border-b border-(--border) px-2 py-1.5 text-right align-top">
                          <InlineMoney
                            defaultValue={r.actual_value}
                            readOnly={!canEdit}
                            disabled={!!saving}
                            onSave={(v) => saveActual(r.item_id, v)}
                          />
                        </td>
                        <td className="border-b border-(--border) px-2 py-1.5 text-xs text-(--muted)">
                          {statusLabelPt(r.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function InlineMoney({
  defaultValue,
  readOnly,
  disabled,
  onSave,
}: {
  defaultValue: number;
  readOnly?: boolean;
  disabled: boolean;
  onSave: (raw: string) => void;
}) {
  const [val, setVal] = useState(() => formatBRL(defaultValue));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVal(formatBRL(defaultValue));
  }, [defaultValue]);

  if (readOnly) {
    return (
      <span className="inline-block min-w-30 text-right text-sm tabular-nums text-(--text)">
        {formatBRL(defaultValue)}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end">
      <input
        className="w-full min-w-30 max-w-40 rounded border border-(--border) bg-(--card) px-2 py-1 text-right text-sm tabular-nums"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(val);
          }
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className="shrink-0 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
        onClick={() => onSave(val)}
      >
        Salvar
      </button>
    </div>
  );
}
