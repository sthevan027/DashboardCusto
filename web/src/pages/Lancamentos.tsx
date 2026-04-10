import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { T, V } from "../lib/db/catalog";
import {
  distributeAmountByWeights,
  formatBRL,
  parseBRLInput,
} from "../lib/money";

type Lookup = {
  item_id: number;
  item_code: string | null;
  item_name: string;
  group_name: string;
  subgroup_name: string | null;
  planned_value: number | string;
};

type Mode = "item" | "group";

const field =
  "mt-2 w-full rounded-xl border border-(--border) bg-(--card) px-3.5 py-2.5 text-sm shadow-sm transition-[box-shadow,border-color] placeholder:text-(--muted)/70 focus:border-(--accent)/40 focus:outline-none focus:ring-[3px] focus:ring-(--accent)/15";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setErr(null);
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

  useEffect(() => {
    if (mode === "item" && itemId !== "") {
      const still = itemsFiltered.some((r) => r.item_id === itemId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!still) setItemId("");
    }
  }, [itemsFiltered, itemId, mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    const amount = parseBRLInput(amountStr);
    if (amount == null || amount < 0) {
      setErr("Informe um valor válido.");
      return;
    }

    if (mode === "item") {
      if (itemId === "") {
        setErr("Selecione um item.");
        return;
      }
      setSaving(true);
      const { error } = await supabase.from(T.cost_entries).insert({
        item_id: itemId as number,
        cost_date: costDate,
        amount,
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
      return;
    }

    if (!groupForBatch) {
      setErr("Selecione um grupo.");
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
    const parts = distributeAmountByWeights(amount, weights);
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
    setMsg(`Distribuído em ${list.length} itens · ${formatBRL(amount)}`);
    setAmountStr("");
    setDescription("");
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-24">
        <div
          className="h-9 w-9 animate-pulse rounded-full border-2 border-(--border) border-t-(--accent)"
          aria-hidden
        />
        <p className="text-sm text-(--muted)">Carregando itens…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-16">
      <header className="mb-10">
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

      <div
        className="mb-8 flex rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/60"
        role="tablist"
        aria-label="Modo de lançamento"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "item"}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            mode === "item"
              ? "bg-(--card) text-(--text) shadow-sm ring-1 ring-(--border)"
              : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => setMode("item")}
        >
          Um item
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "group"}
          className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            mode === "group"
              ? "bg-(--card) text-(--text) shadow-sm ring-1 ring-(--border)"
              : "text-(--muted) hover:text-(--text)"
          }`}
          onClick={() => setMode("group")}
        >
          Por grupo
        </button>
      </div>

      <form
        onSubmit={submit}
        className="space-y-7 rounded-2xl border border-(--border) bg-(--card) p-7 shadow-sm ring-1 ring-black/2 dark:ring-white/4"
      >
        {mode === "item" && (
          <div className="space-y-5">
            <div>
              <label
                htmlFor="lanc-grupo-filtro"
                className="text-sm font-medium text-(--text)"
              >
                Grupo
              </label>
              <select
                id="lanc-grupo-filtro"
                className={field}
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
              </label>
              <select
                id="lanc-item"
                className={field}
                value={itemId === "" ? "" : String(itemId)}
                onChange={(e) =>
                  setItemId(e.target.value ? Number(e.target.value) : "")
                }
                required
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
        )}

        {mode === "group" && (
          <div className="space-y-3">
            <div>
              <label
                htmlFor="lanc-grupo-rateio"
                className="text-sm font-medium text-(--text)"
              >
                Grupo para rateio
              </label>
              <select
                id="lanc-grupo-rateio"
                className={field}
                value={groupForBatch}
                onChange={(e) => setGroupForBatch(e.target.value)}
                required
              >
                <option value="">Escolha…</option>
                {groupsOrdered.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
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
                <br />O valor será repartido na mesma proporção do orçamento de
                cada linha.
              </p>
            ) : null}
          </div>
        )}

        <div className="border-t border-(--border) pt-7">
          <p className="mb-5 text-xs font-medium uppercase tracking-wide text-(--muted)">
            Valor e competência
          </p>
          <div className="space-y-5">
            <div>
              <label
                htmlFor="lanc-data"
                className="text-sm font-medium text-(--text)"
              >
                Competência
              </label>
              <input
                id="lanc-data"
                type="date"
                className={field}
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
              </label>
              <div className="relative mt-2">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-(--muted)">
                  R$
                </span>
                <input
                  id="lanc-valor"
                  inputMode="decimal"
                  autoComplete="off"
                  className={`${field} pl-10 text-base font-medium tabular-nums`}
                  placeholder="0,00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
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
