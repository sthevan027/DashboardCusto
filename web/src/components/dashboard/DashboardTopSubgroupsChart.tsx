import { useMemo, useState } from "react";
import type { SubgroupRow } from "../../lib/dashboardTypes";
import { buildSubgroupChartSeries } from "../../lib/dashboardSubgroupChartBuckets";
import { formatBRL } from "../../lib/money";

type Props = {
  subgroups: SubgroupRow[];
};

const PLOT_H = 200;

function barSize(value: number, maxMag: number, maxPx: number): number {
  if (value <= 0 || maxMag <= 0) return 0;
  const t = Math.sqrt(value) / Math.sqrt(maxMag);
  return Math.max(4, Math.round(t * maxPx));
}

function barWidthPct(value: number, maxMag: number): number {
  if (value <= 0 || maxMag <= 0) return 0;
  return (Math.sqrt(value) / Math.sqrt(maxMag)) * 100;
}

export function DashboardTopSubgroupsChart({ subgroups }: Props) {
  const [orientation, setOrientation] = useState<"vertical" | "horizontal">(
    "vertical",
  );

  const rows = useMemo(() => {
    const core = subgroups.filter((s) =>
      ["Mão de Obra", "Equipamento", "Materiais"].includes(s.group_name),
    );
    return buildSubgroupChartSeries(core);
  }, [subgroups]);

  const maxMag = useMemo(() => {
    if (rows.length === 0) return 1;
    return Math.max(
      ...rows.flatMap((r) => [Number(r.planned_value), Number(r.actual_value)]),
      1,
    );
  }, [rows]);

  if (rows.length === 0 || maxMag <= 0) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
        <h2 className="text-lg font-semibold">
          Onde está o maior custo (subgrupos)
        </h2>
        <p className="mt-2 text-sm text-(--muted)">Sem dados para o gráfico.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-(--border) bg-(--card) p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Custo por frente (sequência fixa)
          </h2>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <div className="flex shrink-0 flex-wrap gap-4 text-xs text-(--muted)">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-blue-600 shadow-sm ring-1 ring-blue-400/30" />
              Previsto
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-red-600 shadow-sm ring-1 ring-red-400/30" />
              Realizado
            </span>
          </div>
          <div className="flex rounded-lg border border-(--border) bg-(--card) p-0.5 text-xs">
            <button
              type="button"
              className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                orientation === "vertical"
                  ? "bg-(--accent-soft) text-(--accent)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
              onClick={() => setOrientation("vertical")}
            >
              Vertical
            </button>
            <button
              type="button"
              className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                orientation === "horizontal"
                  ? "bg-(--accent-soft) text-(--accent)"
                  : "text-(--muted) hover:text-(--text)"
              }`}
              onClick={() => setOrientation("horizontal")}
            >
              Horizontal
            </button>
          </div>
        </div>
      </div>

      {orientation === "vertical" ? (
        <div className="mt-6 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          <div
            className="flex min-w-min items-end justify-start gap-2 px-0.5 sm:gap-4"
            style={{ minHeight: PLOT_H + 88 }}
          >
            {rows.map((s) => {
              const p = Number(s.planned_value);
              const a = Number(s.actual_value);
              const hP = barSize(p, maxMag, PLOT_H);
              const hA = barSize(a, maxMag, PLOT_H);
              const lab = s.fullLabel;
              return (
                <div
                  key={s.id}
                  className="flex w-22 shrink-0 flex-col items-center gap-2 sm:w-26"
                >
                  <div
                    className="flex w-full items-end justify-center gap-1.5"
                    style={{ height: PLOT_H }}
                  >
                    <div className="flex h-full w-[30%] max-w-8 min-w-5 flex-col justify-end">
                      <div
                        className="w-full rounded-t-md bg-blue-600 shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)] dark:bg-blue-500"
                        style={{
                          height: hP,
                          minHeight: p > 0 ? 4 : 0,
                        }}
                        title={`Previsto: ${formatBRL(p)}`}
                      />
                    </div>
                    <div className="flex h-full w-[30%] max-w-8 min-w-5 flex-col justify-end">
                      <div
                        className="w-full rounded-t-md bg-red-600 shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)] dark:bg-red-500"
                        style={{
                          height: hA,
                          minHeight: a > 0 ? 4 : 0,
                        }}
                        title={`Realizado: ${formatBRL(a)}`}
                      />
                    </div>
                  </div>
                  <p
                    className="w-full max-w-24 px-0.5 text-center text-[10px] leading-snug text-(--text) sm:text-[11px]"
                    title={lab}
                  >
                    <span className="line-clamp-4">{s.label}</span>
                  </p>
                  <div className="w-full max-w-22 space-y-1 rounded-lg bg-slate-100/80 px-1 py-1 text-[9px] tabular-nums leading-tight text-(--muted) dark:bg-slate-800/60 sm:text-[10px]">
                    <div className="flex justify-between gap-1 border-b border-(--border)/50 pb-0.5 dark:border-slate-600/50">
                      <span className="shrink-0 text-blue-600 dark:text-blue-400">
                        P
                      </span>
                      <span className="min-w-0 text-right font-medium text-(--text)">
                        {formatBRL(p)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-1">
                      <span className="shrink-0 text-red-600 dark:text-red-400">
                        R
                      </span>
                      <span className="min-w-0 text-right font-medium text-(--text)">
                        {formatBRL(a)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((s) => {
            const p = Number(s.planned_value);
            const a = Number(s.actual_value);
            const wP = barWidthPct(p, maxMag);
            const wA = barWidthPct(a, maxMag);
            return (
              <div
                key={s.id}
                className="flex flex-col gap-1.5 border-b border-(--border)/60 pb-3 last:border-0 sm:flex-row sm:items-center sm:gap-3"
              >
                <div
                  className="w-full shrink-0 text-xs font-medium text-(--text) sm:w-36"
                  title={s.fullLabel}
                >
                  {s.label}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                      P
                    </span>
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/40 dark:bg-slate-700/80">
                      <div
                        className="h-full rounded-full bg-blue-600 dark:bg-blue-500"
                        style={{ width: `${wP}%` }}
                        title={`Previsto: ${formatBRL(p)}`}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-(--muted)">
                      {formatBRL(p)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-[10px] font-medium text-red-600 dark:text-red-400">
                      R
                    </span>
                    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/40 dark:bg-slate-700/80">
                      <div
                        className="h-full rounded-full bg-red-600 dark:bg-red-500"
                        style={{ width: `${wA}%` }}
                        title={`Realizado: ${formatBRL(a)}`}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-[10px] tabular-nums text-(--muted)">
                      {formatBRL(a)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
