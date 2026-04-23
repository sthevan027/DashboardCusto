import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import { T, V } from "../lib/db/catalog";
import { formatBRL } from "../lib/money";
import { isStandalone } from "../lib/presentationMode";
import { mockHistoricoAudit } from "../lib/presentationMockData";

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

type EnrichedRow = {
  id: number;
  cost_id: number | null;
  action: string;
  changed_at: string;
  changed_by: string | null;
  /** Nome em app_profiles (view vw_cost_audit_enriched). */
  changed_by_name: string | null;
  item_id: number | null;
  cost_date_text: string | null;
  amount: number | string | null;
  item_name: string | null;
  group_name: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

const ACTION_PT: Record<string, string> = {
  INSERT: "Inclusão",
  UPDATE: "Alteração",
  DELETE: "Exclusão",
};

async function fetchAuditRows(): Promise<{
  rows: EnrichedRow[];
  error: string | null;
}> {
  if (isStandalone()) {
    return {
      rows: mockHistoricoAudit as EnrichedRow[],
      error: null,
    };
  }
  const { data, error } = await supabase
    .from(V.cost_audit_enriched)
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(300);
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as EnrichedRow[], error: null };
}

function auditUserLabel(
  r: EnrichedRow,
  sessionUserId: string | undefined,
  profileDisplayName: string | null,
): string {
  const n = r.changed_by_name?.trim();
  if (n) return n;
  if (
    sessionUserId &&
    r.changed_by === sessionUserId &&
    profileDisplayName?.trim()
  ) {
    return profileDisplayName.trim();
  }
  if (r.changed_by) return `${String(r.changed_by).slice(0, 8)}…`;
  return "—";
}

export function Historico() {
  const { session, displayName: profileDisplayName } = useAuth();
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [deletingAuditId, setDeletingAuditId] = useState<number | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  async function reloadRows() {
    const { rows: next, error } = await fetchAuditRows();
    if (error) {
      setErr(error);
      return;
    }
    setRows(next);
  }

  useEffect(() => {
    (async () => {
      setErr(null);
      await reloadRows();
      setLoading(false);
    })();
  }, []);

  async function handleRemoveAuditLine(r: EnrichedRow) {
    if (isStandalone()) {
      setErr("Modo demonstração: exclusão desativada.");
      return;
    }
    const hasLinkedEntry = r.cost_id != null && r.action !== "DELETE";
    if (
      !confirm(
        hasLinkedEntry
          ? "Apagar este lançamento? O valor será removido dos totais do dashboard e o histórico desse lançamento será limpo."
          : "Remover esta linha do histórico? Ela deixa de aparecer aqui, sem alterar os totais atuais.",
      )
    ) {
      return;
    }

    setDeletingAuditId(r.id);
    setErr(null);

    let error: { message: string; code?: string } | null = null;

    if (hasLinkedEntry) {
      const { error: deleteEntryError } = await supabase
        .from(T.cost_entries)
        .delete()
        .eq("id", r.cost_id!);

      if (deleteEntryError) {
        error = deleteEntryError;
      } else {
        const { error: deleteAuditError } = await supabase
          .from(T.cost_entries_audit)
          .delete()
          .eq("cost_id", r.cost_id!);
        if (deleteAuditError) error = deleteAuditError;
      }
    } else {
      const { error: deleteAuditError } = await supabase
        .from(T.cost_entries_audit)
        .delete()
        .eq("id", r.id);
      if (deleteAuditError) error = deleteAuditError;
    }

    setDeletingAuditId(null);

    if (error) {
      setErr(
        error.message.includes("policy") || error.code === "42501"
          ? "Sem permissão para apagar o lançamento ou a auditoria. Verifique as políticas RLS de delete em cost_entries e cost_entries_audit."
          : error.message,
      );
      return;
    }

    await reloadRows();
  }

  async function handleClearAllAudit() {
    if (isStandalone()) {
      setErr("Modo demonstração: limpeza de histórico desativada.");
      return;
    }
    if (rows.length === 0) return;

    const linkedCostIds = [
      ...new Set(
        rows
          .filter((row) => row.cost_id != null && row.action !== "DELETE")
          .map((row) => row.cost_id!),
      ),
    ];

    if (
      !confirm(
        linkedCostIds.length > 0
          ? `Apagar todos os ${linkedCostIds.length} lançamento(s) e limpar os ${rows.length} evento(s) do histórico? Isso atualiza os valores do dashboard.`
          : `Apagar todos os ${rows.length} evento(s) do histórico de auditoria? Isso só limpa esta lista.`,
      )
    ) {
      return;
    }

    setClearingAll(true);
    setErr(null);

    let error: { message: string; code?: string } | null = null;

    if (linkedCostIds.length > 0) {
      const { error: deleteEntriesError } = await supabase
        .from(T.cost_entries)
        .delete()
        .in("id", linkedCostIds);
      if (deleteEntriesError) error = deleteEntriesError;
    }

    if (!error) {
      const { error: deleteAuditError } = await supabase
        .from(T.cost_entries_audit)
        .delete()
        .gte("id", 0);
      if (deleteAuditError) error = deleteAuditError;
    }

    setClearingAll(false);

    if (error) {
      setErr(
        error.message.includes("policy") || error.code === "42501"
          ? "Sem permissão para apagar os lançamentos ou a auditoria. Verifique as políticas RLS de delete em cost_entries e cost_entries_audit."
          : error.message,
      );
      return;
    }

    await reloadRows();
  }

  const filtered = useMemo(() => {
    let r = rows;
    if (actionFilter !== "all") {
      r = r.filter((x) => x.action === actionFilter);
    }
    const t = q.trim().toLowerCase();
    if (t) {
      r = r.filter((row) => {
        const blob = [
          row.item_name,
          row.group_name,
          row.cost_id,
          row.action,
          row.cost_date_text,
          row.changed_by,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(t);
      });
    }
    return r;
  }, [rows, actionFilter, q]);

  if (loading) {
    return <p className="text-(--muted)">Carregando histórico…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Histórico de lançamentos</h1>
        <p className="mt-2 max-w-3xl text-sm text-(--muted)">
          A coluna <span className="font-medium text-(--text)">Usuário</span>{" "}
          reflete quem registou o evento quando houver login; até lá pode aparecer
          &quot;—&quot;.
        </p>
      </div>

      {err && (
        <div
          role="alert"
          className="rounded-xl border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-100"
        >
          {err}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-50 flex-1 flex-col gap-1 text-xs font-medium text-(--muted)">
          Buscar
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Item, grupo, ação…"
            className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
          />
        </label>
        <label className="flex w-full min-w-40 flex-col gap-1 text-xs font-medium text-(--muted) sm:w-auto">
          Tipo
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-(--border) bg-(--card) px-3 py-2 text-sm text-(--text)"
          >
            <option value="all">Todas</option>
            <option value="INSERT">Inclusões</option>
            <option value="UPDATE">Alterações</option>
            <option value="DELETE">Exclusões</option>
          </select>
        </label>
        <p className="text-xs text-(--muted)">
          {filtered.length} de {rows.length} evento(s)
        </p>
        {rows.length > 0 ? (
          <button
            type="button"
            disabled={clearingAll}
            className="rounded-lg border border-red-500/35 bg-transparent px-3 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-500/15"
            onClick={() => void handleClearAllAudit()}
          >
            {clearingAll ? "A limpar…" : "Limpar histórico"}
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--card)">
        <table className="w-full min-w-200 text-left text-sm">
          <thead>
            <tr className="border-b border-(--border) bg-slate-50 dark:bg-slate-800/80">
              <th className="px-3 py-2.5 font-medium">Quando</th>
              <th className="px-3 py-2.5 font-medium">Ação</th>
              <th className="px-3 py-2.5 font-medium">Valor</th>
              <th className="px-3 py-2.5 font-medium">Competência</th>
              <th className="px-3 py-2.5 font-medium">Grupo</th>
              <th className="min-w-50 px-3 py-2.5 font-medium">Item</th>
              <th className="min-w-24 max-w-40 px-3 py-2.5 font-medium">
                Usuário
              </th>
              <th className="w-14 px-3 py-2.5 text-center font-medium">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const amt = r.amount != null ? Number(r.amount) : null;
              const deletesCurrentEntry = r.cost_id != null && r.action !== "DELETE";

              return (
                <tr
                  key={r.id}
                  className="border-b border-(--border) align-top hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-(--muted)">
                    {new Date(r.changed_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-slate-800">
                      {ACTION_PT[r.action] ?? r.action}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {amt != null && !Number.isNaN(amt) ? formatBRL(amt) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-(--muted)">
                    {r.cost_date_text
                      ? new Date(
                          r.cost_date_text + "T12:00:00",
                        ).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td
                    className="max-w-35 truncate px-3 py-2.5 text-(--muted)"
                    title={r.group_name ?? ""}
                  >
                    {r.group_name ?? "—"}
                  </td>
                  <td
                    className="max-w-xs px-3 py-2.5 text-xs leading-snug"
                    title={r.item_name ?? ""}
                  >
                    {r.item_name ??
                      (r.item_id != null ? `item #${r.item_id}` : "—")}
                  </td>
                  <td
                    className="max-w-40 truncate px-3 py-2.5 text-xs text-(--muted)"
                    title={auditUserLabel(r, session?.user?.id, profileDisplayName)}
                  >
                    {auditUserLabel(r, session?.user?.id, profileDisplayName)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-red-600 transition-colors hover:border-red-500/30 hover:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/15"
                      title={
                        deletesCurrentEntry
                          ? "Apagar este lançamento e atualizar os totais"
                          : "Remover esta linha do histórico"
                      }
                      aria-label={
                        deletesCurrentEntry
                          ? "Apagar este lançamento e atualizar os totais"
                          : "Remover esta linha do histórico"
                      }
                      disabled={deletingAuditId === r.id || clearingAll}
                      onClick={() => void handleRemoveAuditLine(r)}
                    >
                      {deletingAuditId === r.id ? (
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden
                        />
                      ) : (
                        <IconTrash className="shrink-0" />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && rows.length > 0 && (
        <p className="text-sm text-(--muted)">
          Nenhum evento com os filtros atuais.
        </p>
      )}
      {rows.length === 0 && !loading && (
        <p className="text-sm text-(--muted)">Nenhum evento de histórico.</p>
      )}
    </div>
  );
}
