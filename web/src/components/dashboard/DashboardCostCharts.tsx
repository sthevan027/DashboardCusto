import { useCallback, useMemo, useState } from "react";
import type { SubgroupRow } from "../../lib/dashboardTypes";
import type { SubgroupChartBar } from "../../lib/dashboardSubgroupChartBuckets";
import {
  buildCostDistributionQuad,
  buildEquipmentHorizontalSeries,
  buildMaterialHorizontalSeries,
} from "../../lib/dashboardSubgroupChartBuckets";
import { formatBRL, formatBRLAxis } from "../../lib/money";

type Props = {
  subgroups: SubgroupRow[];
};

const VB = 100;
const CX = 50;
const CY = 50;
/** Raio médio do anel (traço SVG). */
const R_MEAN = 34;
const STROKE = 11;
const GAP_DEG = 2.2;

/** Ângulos em graus: 0 = 3h, sentido anti-horário (padrão SVG/matemática). Topo = -90°. */
function annulusArcPath(
  innerR: number,
  outerR: number,
  angleStartDeg: number,
  angleEndDeg: number,
): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const large = angleEndDeg - angleStartDeg > 180 ? 1 : 0;
  const xo0 = CX + outerR * Math.cos(rad(angleStartDeg));
  const yo0 = CY + outerR * Math.sin(rad(angleStartDeg));
  const xo1 = CX + outerR * Math.cos(rad(angleEndDeg));
  const yo1 = CY + outerR * Math.sin(rad(angleEndDeg));
  const xi0 = CX + innerR * Math.cos(rad(angleStartDeg));
  const yi0 = CY + innerR * Math.sin(rad(angleStartDeg));
  const xi1 = CX + innerR * Math.cos(rad(angleEndDeg));
  const yi1 = CY + innerR * Math.sin(rad(angleEndDeg));
  return [
    `M ${xo0} ${yo0}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${xo1} ${yo1}`,
    `L ${xi1} ${yi1}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

type DonutSeg = {
  id: string;
  label: string;
  value: number;
  colorVar: string;
};

function DistributionDonutCard({
  mo,
  eq,
  mat,
  forn,
}: {
  mo: number;
  eq: number;
  mat: number;
  forn: number;
}) {
  const segments: DonutSeg[] = useMemo(
    () => {
      const raw: DonutSeg[] = [
        { id: "mo", label: "Mão de Obra", value: mo, colorVar: "var(--donut-mo)" },
        { id: "eq", label: "Equipamento", value: eq, colorVar: "var(--donut-eq)" },
        { id: "mat", label: "Materiais", value: mat, colorVar: "var(--donut-mat)" },
        {
          id: "forn",
          label: "Fornecimento",
          value: forn,
          colorVar: "var(--donut-forn)",
        },
      ];
      return raw.filter((s) => s.value > 0);
    },
    [mo, eq, mat, forn],
  );

  const total = useMemo(
    () => segments.reduce((s, x) => s + x.value, 0),
    [segments],
  );

  const paths = useMemo(() => {
    if (total <= 0 || segments.length === 0) return [];
    const innerR = R_MEAN - STROKE / 2;
    const outerR = R_MEAN + STROKE / 2;
    const usable = 360 - segments.length * GAP_DEG;
    let angle = -90;
    const out: { id: string; d: string; seg: DonutSeg; pct: number }[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const frac = seg.value / total;
      const sweep = frac * usable;
      const start = angle;
      const end = angle + sweep;
      const d = annulusArcPath(innerR, outerR, start, end);
      out.push({
        id: seg.id,
        d,
        seg,
        pct: frac * 100,
      });
      angle = end + GAP_DEG;
    }
    return out;
  }, [segments, total]);

  const [tip, setTip] = useState<{
    clientX: number;
    clientY: number;
    label: string;
    value: number;
    pct: number;
  } | null>(null);

  const hideTip = useCallback(() => setTip(null), []);

  return (
    <div className="flex h-full flex-col rounded-xl border border-(--border) bg-(--card) p-5 shadow-(--shadow-card)">
      <h2 className="text-base font-semibold tracking-tight text-(--text)">
        Distribuição de Custos
      </h2>
      <p className="mt-1 text-xs text-(--muted)">Previsto por grupo (contrato)</p>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative w-[min(260px,90vw)] max-w-70">
          <svg
            viewBox={`0 0 ${VB} ${VB}`}
            className="h-auto w-full overflow-visible"
            style={{ shapeRendering: "geometricPrecision" }}
            role="img"
            aria-label={`Distribuição: ${segments.map((s) => `${s.label} ${formatBRL(s.value)}`).join("; ")}`}
          >
            <title>Distribuição de custos por grupo</title>
            {total <= 0 && (
              <circle
                cx={CX}
                cy={CY}
                r={R_MEAN}
                fill="none"
                stroke="var(--border)"
                strokeWidth={STROKE}
              />
            )}
            {paths.map(({ id, d, seg, pct }) => (
              <path
                key={id}
                d={d}
                fill={seg.colorVar}
                stroke="var(--card)"
                strokeWidth={0.35}
                className="cursor-crosshair transition-opacity hover:opacity-90"
                onMouseEnter={(e) => {
                  setTip({
                    clientX: e.clientX,
                    clientY: e.clientY,
                    label: seg.label,
                    value: seg.value,
                    pct,
                  });
                }}
                onMouseMove={(e) => {
                  setTip((t) =>
                    t
                      ? {
                          ...t,
                          clientX: e.clientX,
                          clientY: e.clientY,
                        }
                      : null,
                  );
                }}
                onMouseLeave={hideTip}
              />
            ))}
          </svg>

          {tip && (
            <div
              className="pointer-events-none fixed z-100 rounded-lg border border-(--border) bg-[#141414] px-3 py-2 text-left text-xs shadow-xl ring-1 ring-white/10"
              style={{
                left: tip.clientX + 12,
                top: tip.clientY + 12,
              }}
            >
              <div className="font-semibold text-(--text)">{tip.label}</div>
              <div className="mt-0.5 tabular-nums text-(--text)">
                {formatBRL(tip.value)}
              </div>
              <div className="mt-0.5 text-(--muted)">
                {tip.pct.toFixed(1)}% do total
              </div>
            </div>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          {segments.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 text-(--text)"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/15"
                style={{ background: s.colorVar }}
              />
              {s.label}
              <span className="tabular-nums text-(--muted)">
                {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : "—"}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Valor sempre no centro horizontal da trilha (0–máx.), não no segmento colorido. */
function BarTrackCenterLabel({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span
        className="max-w-[calc(100%-0.5rem)] truncate px-1 text-center text-[10px] font-semibold tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] sm:text-[11px]"
        aria-hidden
      >
        {formatBRLAxis(value)}
      </span>
    </div>
  );
}

type HorizontalBreakdownView = "equipment" | "material";

function HorizontalCostBreakdownCard({
  rows,
  view,
  onViewChange,
}: {
  rows: SubgroupChartBar[];
  view: HorizontalBreakdownView;
  onViewChange: (v: HorizontalBreakdownView) => void;
}) {
  /** Escala pelo maior valor entre previsto e realizado (evita eixo R$ 0–1). */
  const maxVal = useMemo(() => {
    const nums = rows.flatMap((r) => [
      Number(r.planned_value),
      Number(r.actual_value),
    ]);
    const m = nums.length ? Math.max(...nums) : 0;
    return m > 0 ? m : 0;
  }, [rows]);

  const ticks = useMemo(() => {
    if (maxVal <= 0) return [0, 0, 0, 0, 0];
    return [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxVal);
  }, [maxVal]);

  const title =
    view === "equipment" ? "Custos por Equipamento" : "Custos por Material";

  return (
    <div className="flex h-full flex-col rounded-xl border border-(--border) bg-(--card) p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-(--text)">
          {title}
        </h2>
        <div
          className="inline-flex shrink-0 rounded-lg border border-(--border) bg-black/25 p-0.5"
          role="group"
          aria-label="Alternar visão do gráfico"
        >
          <button
            type="button"
            onClick={() => onViewChange("equipment")}
            className={
              view === "equipment"
                ? "rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-(--text) shadow-sm ring-1 ring-white/10"
                : "rounded-md px-3 py-1 text-xs font-medium text-(--muted) transition hover:text-(--text)"
            }
          >
            Equipamento
          </button>
          <button
            type="button"
            onClick={() => onViewChange("material")}
            className={
              view === "material"
                ? "rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-(--text) shadow-sm ring-1 ring-white/10"
                : "rounded-md px-3 py-1 text-xs font-medium text-(--muted) transition hover:text-(--text)"
            }
          >
            Material
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-(--muted)">
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full bg-(--chart-planned) shadow-[0_0_12px_rgba(59,130,246,0.45)]"
            aria-hidden
          />
          <span>Previsto</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-full bg-(--chart-actual) shadow-[0_0_12px_rgba(239,68,68,0.4)]"
            aria-hidden
          />
          <span>Realizado</span>
        </span>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        {maxVal <= 0 ? (
          <p className="text-sm text-(--muted)">
            {view === "equipment"
              ? "Sem valores de equipamento para exibir."
              : "Sem valores de materiais para exibir."}
          </p>
        ) : (
          <>
            <div className="mb-3 flex justify-between pl-29 text-[10px] tabular-nums text-(--muted) sm:text-xs">
              {ticks.map((v, i) => (
                <span key={i} className="max-w-18 truncate text-right">
                  {formatBRLAxis(v)}
                </span>
              ))}
            </div>

            <div className="space-y-4">
              {rows.map((r) => {
                const planned = Number(r.planned_value);
                const actual = Number(r.actual_value);
                const wAct = maxVal > 0 ? (actual / maxVal) * 100 : 0;
                const wPlan = maxVal > 0 ? (planned / maxVal) * 100 : 0;
                return (
                  <div
                    key={r.id}
                    className="flex items-stretch gap-2 sm:gap-3"
                    title={`${r.fullLabel} — Prev: ${formatBRL(planned)} · Real: ${formatBRL(actual)}`}
                  >
                    <div className="flex w-24 shrink-0 items-center justify-end text-right text-[11px] font-medium leading-tight text-(--text) sm:w-28 sm:text-xs">
                      {r.label}
                    </div>
                    <div className="relative min-w-0 flex-1">
                      <div
                        className="pointer-events-none absolute inset-0 grid grid-cols-5"
                        aria-hidden
                      >
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="border-r border-dotted border-(--chart-grid-line) last:border-0"
                          />
                        ))}
                      </div>
                      <div className="relative flex flex-col gap-2.5 py-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 shrink-0 text-center text-[11px] font-bold"
                            style={{ color: "var(--chart-planned)" }}
                          >
                            P
                          </span>
                          <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-white/6">
                            <div
                              className="absolute left-0 top-0 z-0 h-4 min-w-0.75 rounded-r-full bg-(--chart-planned) shadow-[0_0_16px_rgba(59,130,246,0.35)]"
                              style={{
                                width: `${Math.min(100, Math.max(wPlan, planned > 0 ? 0.35 : 0))}%`,
                              }}
                              aria-hidden
                            />
                            <BarTrackCenterLabel value={planned} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="w-4 shrink-0 text-center text-[11px] font-bold"
                            style={{ color: "var(--chart-actual)" }}
                          >
                            R
                          </span>
                          <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-white/6">
                            <div
                              className="absolute left-0 top-0 z-0 h-4 min-w-0.75 rounded-r-full bg-(--chart-actual) shadow-[0_0_16px_rgba(239,68,68,0.35)]"
                              style={{
                                width: `${Math.min(100, Math.max(wAct, actual > 0 ? 0.35 : 0))}%`,
                              }}
                              aria-hidden
                            />
                            <BarTrackCenterLabel value={actual} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DashboardCostCharts({ subgroups }: Props) {
  const [horizontalView, setHorizontalView] =
    useState<HorizontalBreakdownView>("equipment");

  const dist = useMemo(
    () => buildCostDistributionQuad(subgroups),
    [subgroups],
  );

  const equipRows = useMemo(
    () => buildEquipmentHorizontalSeries(subgroups),
    [subgroups],
  );

  const materialRows = useMemo(
    () => buildMaterialHorizontalSeries(subgroups),
    [subgroups],
  );

  const horizontalRows =
    horizontalView === "equipment" ? equipRows : materialRows;

  const hasAny =
    dist.mo + dist.eq + dist.mat + dist.forn > 0 ||
    equipRows.some(
      (r) => Number(r.actual_value) > 0 || Number(r.planned_value) > 0,
    ) ||
    materialRows.some(
      (r) => Number(r.actual_value) > 0 || Number(r.planned_value) > 0,
    );

  if (!hasAny) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-(--shadow-card)">
        <h2 className="text-lg font-semibold">Gráficos</h2>
        <p className="mt-2 text-sm text-(--muted)">Sem dados para os gráficos.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <DistributionDonutCard
        mo={dist.mo}
        eq={dist.eq}
        mat={dist.mat}
        forn={dist.forn}
      />
      <HorizontalCostBreakdownCard
        rows={horizontalRows}
        view={horizontalView}
        onViewChange={setHorizontalView}
      />
    </div>
  );
}
