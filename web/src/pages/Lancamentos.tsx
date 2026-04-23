import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { T, V } from "../lib/db/catalog";
import {
  distributeAmountByWeights,
  formatBRL,
  formatBRLDecimalField,
  parseBRLInput,
} from "../lib/money";
import { isStandalone } from "../lib/presentationMode";
import { mockLancamentoItems, mockLancamentoRecent } from "../lib/presentationMockData";

type Lookup = {
  item_id: number;
  item_code: string | null;
  item_name: string;
  group_name: string;
  subgroup_name: string | null;
  planned_value: number | string;
};

type Mode = "item" | "group";

type FieldKey = "item" | "amount" | "groupBatch";

type RecentEntry = {
  id: number;
  item_id: number;
  cost_date: string;
  amount: number;
  description: string | null;
  created_at: string;
};

const fieldBase =
  "mt-2 w-full rounded-xl border border-(--border) bg-(--card) px-3.5 py-2.5 text-sm shadow-sm transition-[box-shadow,border-color] placeholder:text-(--muted)/70 focus:border-(--accent)/40 focus:outline-none focus:ring-[3px] focus:ring-(--accent)/15";

function fieldClassNames(invalid?: boolean) {
  return `${fieldBase} ${
    invalid
      ? "border-red-500/70 ring-2 ring-red-500/20 focus:border-red-500/50 focus:ring-red-500/15"
      : ""
  }`;
}

function RequiredMark() {
  return (
    <>
      {" "}
      <span className="text-red-600 dark:text-red-400" aria-hidden>
        *
      </span>
      <span className="sr-only"> (obrigatório)</span>
    </>
  );
}

const RATEIO_PREVIEW_VISIBLE = 3;

export function Lancamentos() {
  const [items, setItems] = useState<Lookup[]>([]);
  const [mode, setMode] = useState<Mode>("item");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [groupForBatch, setGroupForBatch] = useState<string>("");
  const [itemId, setItemId] = useState<number | "">("");
  const [costDate, setCostDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [amountStr, setAmountStr] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>(
    {},
  );
  const [amountBlurHint, setAmountBlurHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [rateioPreviewOpen, setRateioPreviewOpen] = useState(false);

  const loadRecentEntries = useCallback(async () => {
    if (isStandalone()) {
      setRecentLoading(true);
      setRecentEntries(
        mockLancamentoRecent as unknown as RecentEntry[],
      );
      setRecentLoading(false);
      return;
    }
    setRecentLoading(true);
    const { data, error } = await supabase
      .from(T.cost_entries)
      .select("id, item_id, cost_date, amount, description, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    setRecentLoading(false);
    if (error) {
      console.error(error);
      setRecentEntries([]);
      return;
    }
    setRecentEntries((data ?? []) as RecentEntry[]);
  }, []);

  useEffect(() => {
    (async () => {
      setErr(null);
      if (isStandalone()) {
        setItems(mockLancamentoItems as unknown as Lookup[]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from(V.cost_item_lookup)
        .select("*")
        .order("group_name")
        .order("item_code");
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      setItems((data ?? []) as Lookup[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await loadRecentEntries();
    })();
  }, [loadRecentEntries]);

  const groupsOrdered = useMemo(() => {
    const s = new Set<string>();
    for (const r of items) s.add(r.group_name);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const itemsFiltered = useMemo(() => {
    if (!groupFilter) return items;
    return items.filter((r) => r.group_name === groupFilter);
  }, [items, groupFilter]);

  const itemsInSelectedGroup = useMemo(() => {
    if (!groupForBatch) return [];
    return items.filter((r) => r.group_name === groupForBatch);
  }, [items, groupForBatch]);

  const groupPlannedTotal = useMemo(() => {
    return itemsInSelectedGroup.reduce(
      (s, r) => s + Number(r.planned_value),
      0,
    );
  }, [itemsInSelectedGroup]);

  const selectedItem = useMemo(() => {
    if (itemId === "") return null;
    return items.find((r) => r.item_id === itemId) ?? null;
  }, [items, itemId]);

  const itemLabelById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of items) {
      m.set(
        r.item_id,
        `${r.item_code ? `${r.item_code} · ` : ""}${r.item_name}`,
      );
    }
    return m;
  }, [items]);

  const rateioPreviewRows = useMemo(() => {
    if (mode !== "group" || !groupForBatch || itemsInSelectedGroup.length === 0) {
      return null;
    }
    const amount = parseBRLInput(amountStr);
    if (amount == null || amount < 0) return null;
    const weights = itemsInSelectedGroup.map((r) => Number(r.planned_value));
    if (weights.every((w) => w <= 0)) return null;
    const parts = distributeAmountByWeights(amount, weights);
    return itemsInSelectedGroup.map((r, i) => ({
      item: r,
      part: parts[i]!,
      weight: weights[i]!,
    }));
  }, [mode, groupForBatch, amountStr, itemsInSelectedGroup]);

  useEffect(() => {
    if (mode === "item" && itemId !== "") {
      const still = itemsFiltered.some((r) => r.item_id === itemId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!still) setItemId("");
    }
  }, [itemsFiltered, itemId, mode]);

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function onAmountBlur() {
    const raw = amountStr.trim();
    if (!raw) {
      setAmountBlurHint(null);
      return;
    }
    const n = parseBRLInput(amountStr);
    if (n == null) {
      setAmountBlurHint("Valor inválido. Use números como 1.234,56.");
      return;
    }
    setAmountBlurHint(null);
    clearFieldError("amount");
    setAmountStr(formatBRLDecimalField(n));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    setFieldErrors({});
    setAmountBlurHint(null);

    if (isStandalone()) {
      setMsg("Modo demonstração: o lançamento não é gravado no banco.");
      return;
    }

    const amount = parseBRLInput(amountStr);
    const nextFieldErrors: Partial<Record<FieldKey, string>> = {};

    if (amount == null || amount < 0) {
      nextFieldErrors.amount = "Informe um valor válido.";
    }

    if (mode === "item") {
      if (itemId === "") {
        nextFieldErrors.item = "Selecione um item.";
      }
    } else {
      if (!groupForBatch) {
        nextFieldErrors.groupBatch = "Selecione um grupo.";
      }
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    if (mode === "item") {
      setSaving(true);
      const { error } = await supabase.from(T.cost_entries).insert({
        item_id: itemId as number,
        cost_date: costDate,
        amount: amount!,
        description: description.trim() || null,
        external_id: `UI-${Date.now()}`,
      });
      setSaving(false);
      if (error) {
        setErr(error.message);
        return;
      }
      setMsg("Registrado com sucesso.");
      setAmountStr("");
      setDescription("");
      void loadRecentEntries();
      return;
    }

    const list = itemsInSelectedGroup;
    if (list.length === 0) {
      setErr("Não há itens com orçamento neste grupo.");
      return;
    }
    const weights = list.map((r) => Number(r.planned_value));
    if (weights.every((w) => w <= 0)) {
      setErr("O orçamento do grupo está zerado — não é possível distribuir.");
      return;
    }

    setSaving(true);
    const parts = distributeAmountByWeights(amount!, weights);
    const ts = Date.now();
    const rows = list.map((r, i) => ({
      item_id: r.item_id,
      cost_date: costDate,
      amount: parts[i]!,
      description: description.trim()
        ? `${description.trim()} (grupo ${groupForBatch})`
        : `Rateio grupo ${groupForBatch}`,
      external_id: `UI-G-${ts}-${i}-${r.item_id}`,
    }));

    const { error } = await supabase.from(T.cost_entries).insert(rows);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg(`Distribuído em ${list.length} itens · ${formatBRL(amount!)}`);
    setAmountStr("");
    setDescription("");
    void loadRecentEntries();
  }

  if (loading) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 py-24">
        <div
          className="h-9 w-9 animate-pulse rounded-full border-2 border-(--border) border-t-(--accent)"
          aria-hidden
        />
        <p className="text-sm text-(--muted)">Carregando itens…</p>
      </div>
    );
  }

  const visibleRateioRows =
    rateioPreviewRows &&
    (rateioPreviewOpen
      ? rateioPreviewRows
      : rateioPreviewRows.slice(0, RATEIO_PREVIEW_VISIBLE));

  return (
    <div className="w-full max-w-400 pb-16">
      <header className="mb-8 lg:mb-10">
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-(--text)">
          Lançamentos
        </h1>
      </header>

      {err && (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100"
        >
          {err}
        </div>
      )}
      {msg && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
        >
          {msg}
        </div>
      )}

      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.32fr)_minmax(300px,1fr)] lg:items-start lg:gap-8 xl:gap-10 2xl:grid-cols-[minmax(0,1.42fr)_minmax(380px,1.08fr)]">
        <form
          onSubmit={submit}
          className="space-y-7 rounded-2xl border border-(--border) bg-(--card) p-6 shadow-sm ring-1 ring-black/2 sm:p-7 dark:ring-white/4"
          noValidate
        >
          <div>
            <div
              className="flex rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/60"
              role="tablist"
              aria-label="Modo de lançamento"
            >
              <button
                type="button"
                id="lanc-tab-item"
                role="tab"
                aria-selected={mode === "item"}
                aria-controls="lanc-panel-item"
                tabIndex={mode === "item" ? 0 : -1}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card) ${
                  mode === "item"
                    ? "bg-(--card) text-(--text) shadow-sm ring-1 ring-(--border)"
                    : "text-(--muted) hover:text-(--text)"
                }`}
                onClick={() => {
                  setMode("item");
                  setFieldErrors({});
                  setErr(null);
                }}
              >
                Um item
              </button>
              <button
                type="button"
                id="lanc-tab-group"
                role="tab"
                aria-selected={mode === "group"}
                aria-controls="lanc-panel-group"
                tabIndex={mode === "group" ? 0 : -1}
                className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card) ${
                  mode === "group"
                    ? "bg-(--card) text-(--text) shadow-sm ring-1 ring-(--border)"
                    : "text-(--muted) hover:text-(--text)"
                }`}
                onClick={() => {
                  setMode("group");
                  setFieldErrors({});
                  setErr(null);
                }}
              >
                Por grupo
              </button>
            </div>

            <div
              id="lanc-panel-item"
              role="tabpanel"
              aria-labelledby="lanc-tab-item"
              hidden={mode !== "item"}
              className="mt-7 space-y-5"
            >
              <div>
                <p className="text-sm font-semibold text-(--text)">
                  <span className="text-(--muted)">1 ·</span> Item
                </p>
                <div className="mt-4 space-y-5">
                  <div>
                    <label
                      htmlFor="lanc-grupo-filtro"
                      className="text-sm font-medium text-(--text)"
                    >
                      Grupo (filtro)
                    </label>
                    <select
                      id="lanc-grupo-filtro"
                      className={fieldClassNames()}
                      value={groupFilter}
                      onChange={(e) => setGroupFilter(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {groupsOrdered.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="lanc-item"
                      className="text-sm font-medium text-(--text)"
                    >
                      Item
                      <RequiredMark />
                    </label>
                    <select
                      id="lanc-item"
                      className={fieldClassNames(!!fieldErrors.item)}
                      value={itemId === "" ? "" : String(itemId)}
                      onChange={(e) => {
                        setItemId(e.target.value ? Number(e.target.value) : "");
                        clearFieldError("item");
                      }}
                      aria-invalid={!!fieldErrors.item}
                      aria-describedby={
                        fieldErrors.item ? "lanc-item-error" : undefined
                      }
                    >
                      <option value="">Escolha um item…</option>
                      {itemsFiltered.map((r) => (
                        <option key={r.item_id} value={r.item_id}>
                          {r.item_code ?? "—"} · {r.group_name} /{" "}
                          {r.subgroup_name ?? "—"} — {r.item_name.slice(0, 72)}
                          {r.item_name.length > 72 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.item ? (
                      <p
                        id="lanc-item-error"
                        className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {fieldErrors.item}
                      </p>
                    ) : null}
                  </div>
                  {selectedItem && (
                    <div className="rounded-xl bg-slate-50/90 px-3.5 py-3 text-xs leading-relaxed text-(--muted) dark:bg-slate-800/50">
                      <span className="text-(--text)">Orçamento do item:</span>{" "}
                      <span className="tabular-nums font-medium text-(--text)">
                        {formatBRL(Number(selectedItem.planned_value))}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              id="lanc-panel-group"
              role="tabpanel"
              aria-labelledby="lanc-tab-group"
              hidden={mode !== "group"}
              className="mt-7 space-y-4"
            >
              <div>
                <p className="text-sm font-semibold text-(--text)">
                  <span className="text-(--muted)">1 ·</span> Grupo
                </p>
                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="lanc-grupo-rateio"
                      className="text-sm font-medium text-(--text)"
                    >
                      Grupo para rateio
                      <RequiredMark />
                    </label>
                    <select
                      id="lanc-grupo-rateio"
                      className={fieldClassNames(!!fieldErrors.groupBatch)}
                      value={groupForBatch}
                      onChange={(e) => {
                        setGroupForBatch(e.target.value);
                        clearFieldError("groupBatch");
                        setRateioPreviewOpen(false);
                      }}
                      aria-invalid={!!fieldErrors.groupBatch}
                      aria-describedby={
                        fieldErrors.groupBatch
                          ? "lanc-grupo-rateio-error"
                          : undefined
                      }
                    >
                      <option value="">Escolha…</option>
                      {groupsOrdered.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.groupBatch ? (
                      <p
                        id="lanc-grupo-rateio-error"
                        className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                        role="alert"
                      >
                        {fieldErrors.groupBatch}
                      </p>
                    ) : null}
                  </div>
                  {groupForBatch ? (
                    <p className="rounded-xl bg-slate-50/90 px-3.5 py-3 text-xs leading-relaxed text-(--muted) dark:bg-slate-800/50">
                      <span className="text-(--text)">
                        {itemsInSelectedGroup.length}
                      </span>{" "}
                      itens · orçamento do grupo{" "}
                      <span className="tabular-nums font-medium text-(--text)">
                        {formatBRL(groupPlannedTotal)}
                      </span>
                      <br />O valor será repartido na mesma proporção do
                      orçamento de cada linha.
                    </p>
                  ) : null}

                  {rateioPreviewRows && rateioPreviewRows.length > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-(--border) bg-slate-50/50 dark:bg-slate-900/30">
                      <div className="flex items-center justify-between border-b border-(--border) px-3 py-2">
                        <span className="text-xs font-medium text-(--text)">
                          Prévia do rateio
                        </span>
                        {rateioPreviewRows.length > RATEIO_PREVIEW_VISIBLE ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-(--accent) underline-offset-2 hover:underline"
                            onClick={() =>
                              setRateioPreviewOpen((o) => !o)
                            }
                          >
                            {rateioPreviewOpen
                              ? "Ver menos"
                              : `Ver mais (${rateioPreviewRows.length})`}
                          </button>
                        ) : null}
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-(--border) text-(--muted)">
                            <th className="px-3 py-2 font-medium">Item</th>
                            <th className="px-3 py-2 text-right font-medium">
                              Valor
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRateioRows!.map((row) => (
                            <tr
                              key={row.item.item_id}
                              className="border-b border-(--border)/60 last:border-0"
                            >
                              <td className="max-w-50 truncate px-3 py-2 text-(--text)">
                                {row.item.item_code ?? "—"} ·{" "}
                                {row.item.item_name.slice(0, 48)}
                                {row.item.item_name.length > 48 ? "…" : ""}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-(--text)">
                                {formatBRL(row.part)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-(--border) pt-7">
            <div className="mb-5 flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-tight text-(--text)">
                <span className="text-(--muted)">2 ·</span> Valor e competência
              </h2>
              <span className="text-xs text-(--muted)">
                Informe o período e o montante do lançamento.
              </span>
            </div>
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="lanc-data"
                  className="text-sm font-medium text-(--text)"
                >
                  Competência
                  <RequiredMark />
                </label>
                <input
                  id="lanc-data"
                  type="date"
                  className={fieldClassNames()}
                  value={costDate}
                  onChange={(e) => setCostDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="lanc-valor"
                  className="text-sm font-medium text-(--text)"
                >
                  Valor
                  <RequiredMark />
                </label>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-(--muted)">
                    R$
                  </span>
                  <input
                    id="lanc-valor"
                    inputMode="decimal"
                    autoComplete="off"
                    className={`${fieldClassNames(!!fieldErrors.amount)} pl-10 text-base font-medium tabular-nums`}
                    placeholder="0,00"
                    value={amountStr}
                    onChange={(e) => {
                      setAmountStr(e.target.value);
                      clearFieldError("amount");
                      setAmountBlurHint(null);
                    }}
                    onBlur={onAmountBlur}
                    aria-invalid={!!fieldErrors.amount}
                    aria-describedby={
                      [fieldErrors.amount && "lanc-valor-error", amountBlurHint && "lanc-valor-blur"]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                  />
                </div>
                {fieldErrors.amount ? (
                  <p
                    id="lanc-valor-error"
                    className="mt-1.5 text-xs text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {fieldErrors.amount}
                  </p>
                ) : null}
                {!fieldErrors.amount && amountBlurHint ? (
                  <p
                    id="lanc-valor-blur"
                    className="mt-1.5 text-xs text-amber-700 dark:text-amber-400"
                  >
                    {amountBlurHint}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="lanc-obs"
              className="text-sm font-medium text-(--text)"
            >
              Observação{" "}
              <span className="font-normal text-(--muted)">(opcional)</span>
            </label>
            <textarea
              id="lanc-obs"
              rows={3}
              className={`${fieldClassNames()} resize-y`}
              placeholder="Notas internas sobre este lançamento…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-(--accent) px-4 py-3.5 text-sm font-medium text-white shadow-sm transition-[opacity,transform] hover:opacity-[0.97] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50"
          >
            {saving
              ? "Salvando…"
              : mode === "group"
                ? "Distribuir e registrar"
                : "Registrar lançamento"}
          </button>
        </form>

        <aside className="min-h-0 min-w-0 rounded-2xl border border-(--border) bg-(--card) p-5 shadow-sm ring-1 ring-black/2 dark:ring-white/4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-4rem)] lg:overflow-y-auto lg:self-start">
          <h2 className="text-sm font-semibold text-(--text)">
            Últimos lançamentos
          </h2>
          <p className="mt-1 text-xs text-(--muted)">
            Até 10 registros mais recentes.
          </p>
          {recentLoading ? (
            <ul className="mt-4 space-y-3" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <li
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-slate-100/80 dark:bg-slate-800/50"
                />
              ))}
            </ul>
          ) : recentEntries.length === 0 ? (
            <p className="mt-4 text-sm text-(--muted)">
              Nenhum lançamento ainda.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentEntries.map((row) => {
                const label =
                  itemLabelById.get(row.item_id) ?? `Item #${row.item_id}`;
                const dateFmt = new Date(row.cost_date + "T12:00:00").toLocaleDateString(
                  "pt-BR",
                );
                return (
                  <li
                    key={row.id}
                    className="rounded-xl border border-(--border)/80 bg-slate-50/80 px-3 py-2.5 text-xs dark:bg-slate-900/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="line-clamp-2 min-w-0 flex-1 font-medium leading-snug text-(--text)">
                        {label}
                      </span>
                      <span className="shrink-0 tabular-nums font-medium text-(--text)">
                        {formatBRL(Number(row.amount))}
                      </span>
                    </div>
                    <div className="mt-1 text-(--muted)">
                      {dateFmt}
                      {row.description ? (
                        <span
                          className="line-clamp-2 block wrap-break-word"
                          title={row.description}
                        >
                          {row.description}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-(--muted)">
        Para editar orçamentos linha a linha, abra{" "}
        <Link
          to="/visual"
          className="font-medium text-(--accent) underline-offset-4 hover:underline"
        >
          Visual (Dados)
        </Link>
        .
      </p>
    </div>
  );
}
