import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { formatBRL, formatBRLAxis } from "../../lib/money";

/** Previsto por grupo — deve vir de `groupsMerged` no Dashboard (inclui 6.1.1 em Equipamento). */
export type TemporalForecastPlanned = {
  mo: number;
  eq: number;
  mat: number;
  forn: number;
};

type Props = {
  planned: TemporalForecastPlanned;
};

/** Contrato: 15 meses a partir de maio de 2026 (até julho de 2027). */
const CONTRACT_MONTHS = 15;
const CONTRACT_START_YEAR = 2026;
const CONTRACT_START_MONTH_INDEX = 4; // Maio (0-based)

type CumPoint = {
  monthKey: string;
  label: string;
  mo: number;
  eq: number;
  mat: number;
  forn: number;
  total: number;
};

type Pt = { x: number; y: number };

const VB_W = 920;
const VB_H = 360;
const PAD_L = 62;
const PAD_R = 24;
const PAD_T = 36;
const PAD_B = 76;

function monthLabelPt(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  if (Number.isNaN(d.getTime())) return isoDate;
  const m = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const y = d.toLocaleDateString("pt-BR", { year: "2-digit" });
  const cap = m.charAt(0).toUpperCase() + m.slice(1);
  return `${cap}/${y}`;
}

function contractMonthKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < CONTRACT_MONTHS; i++) {
    const d = new Date(
      Date.UTC(
        CONTRACT_START_YEAR,
        CONTRACT_START_MONTH_INDEX + i,
        1,
      ),
    );
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function spendCurve(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function buildForecastPoints(planned: TemporalForecastPlanned): CumPoint[] {
  const monthKeys = contractMonthKeys();
  const out: CumPoint[] = [];
  for (let i = 0; i < monthKeys.length; i++) {
    const s = spendCurve((i + 1) / CONTRACT_MONTHS);
    const mo = planned.mo * s;
    const eq = planned.eq * s;
    const mat = planned.mat * s;
    const forn = planned.forn * s;
    const mk = monthKeys[i]!;
    out.push({
      monthKey: mk,
      label: monthLabelPt(mk),
      mo,
      eq,
      mat,
      forn,
      total: mo + eq + mat + forn,
    });
  }
  return out;
}

/**
 * Tecto do eixo Y: pouco acima do máximo das séries, sem saltos grandes
 * (ex.: ~5,3M não deve ir para 10M).
 */
function niceMaxYChart(raw: number): number {
  if (raw <= 0) return 1;
  const target = raw * 1.06;
  const pow = 10 ** Math.floor(Math.log10(target));
  const n = target / pow;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10];
  for (const s of steps) {
    if (n <= s) return s * pow;
  }
  return 10 * pow;
}

function smoothBezierPath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0]!.x} ${pts[0]!.y}`;
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPathUnder(
  lineD: string,
  baseY: number,
  lastX: number,
  firstX: number,
): string {
  if (!lineD.startsWith("M")) return "";
  return `${lineD} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
}

export function DashboardTemporalCostChart({ planned }: Props) {
  const points = useMemo(() => {
    const t = planned.mo + planned.eq + planned.mat + planned.forn;
    if (t <= 0) return [];
    return buildForecastPoints(planned);
  }, [planned]);

  const [tip, setTip] = useState<{
    clientX: number;
    clientY: number;
    p: CumPoint;
    index: number;
  } | null>(null);

  /** Escala pelo maior valor entre as três séries (linhas não empilhadas). */
  const maxY = useMemo(() => {
    let m = 0;
    for (const p of points) {
      m = Math.max(m, p.mo, p.eq, p.mat, p.forn);
    }
    return niceMaxYChart(m);
  }, [points]);

  const innerW = VB_W - PAD_L - PAD_R;
  const innerH = VB_H - PAD_T - PAD_B;
  const baseY = PAD_T + innerH;

  const xAt = useCallback(
    (i: number) => {
      const n = points.length;
      if (n <= 1) return PAD_L + innerW / 2;
      return PAD_L + (i / (n - 1)) * innerW;
    },
    [points.length, innerW],
  );

  const yAt = useCallback(
    (v: number) => PAD_T + innerH - (maxY > 0 ? (v / maxY) * innerH : innerH),
    [innerH, maxY],
  );

  const ticks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY), [maxY]);

  const seriesMeta = useMemo(
    () =>
      [
        { key: "mo" as const, label: "Mão de Obra", stroke: "var(--donut-mo)" },
        { key: "eq" as const, label: "Equipamento", stroke: "var(--donut-eq)" },
        { key: "mat" as const, label: "Materiais", stroke: "var(--donut-mat)" },
        {
          key: "forn" as const,
          label: "Fornecimento",
          stroke: "var(--donut-forn)",
        },
      ] as const,
    [],
  );

  const linePaths = useMemo(() => {
    const out: Record<"mo" | "eq" | "mat" | "forn", string> = {
      mo: "",
      eq: "",
      mat: "",
      forn: "",
    };
    if (points.length === 0) return out;
    for (const key of ["mo", "eq", "mat", "forn"] as const) {
      const pts: Pt[] = points.map((p, i) => ({
        x: xAt(i),
        y: yAt(p[key]),
      }));
      out[key] = smoothBezierPath(pts);
    }
    return out;
  }, [points, xAt, yAt]);

  const firstX = points.length ? xAt(0) : PAD_L;
  const lastX = points.length ? xAt(points.length - 1) : PAD_L + innerW;

  const hideTip = useCallback(() => setTip(null), []);

  const onSvgMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (points.length === 0) return;
      const svg = e.currentTarget;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const x = (e.clientX - ctm.e) / ctm.a;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(x - xAt(i));
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      setTip({
        clientX: e.clientX,
        clientY: e.clientY,
        p: points[best]!,
        index: best,
      });
    },
    [points, xAt],
  );

  if (points.length === 0) {
    return (
      <section className="rounded-2xl border border-(--border) bg-(--card) p-6 shadow-(--shadow-card) ring-1 ring-white/[0.04]">
        <h2 className="text-lg font-semibold tracking-tight text-(--text)">
          Evolução temporal dos custos
        </h2>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-(--border) bg-(--card) p-6 shadow-(--shadow-card) ring-1 ring-white/[0.04]">
      <div className="flex flex-col gap-4 border-b border-(--border)/50 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-(--text)">
            Evolução temporal dos custos
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-(--muted)">
            Previsão acumulada no contrato ({CONTRACT_MONTHS} meses: mai/2026 a
            jul/2027).
          </p>
        </div>
        <div
          className="flex shrink-0 flex-wrap gap-x-5 gap-y-2 text-xs sm:justify-end"
          aria-hidden
        >
          {seriesMeta.map((s) => (
            <span
              key={s.key}
              className="inline-flex items-center gap-2 text-(--text)"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px_currentColor] ring-1 ring-white/20"
                style={{ background: s.stroke, color: s.stroke }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative mt-5 w-full overflow-x-auto rounded-xl bg-black/25 p-3 ring-1 ring-inset ring-white/[0.06]">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="h-auto w-full min-w-[min(100%,520px)]"
          role="img"
          aria-label="Gráfico: evolução prevista acumulada por mês por grupo (MO, EQ, MAT, Fornecimento)"
          onMouseMove={onSvgMove}
          onMouseLeave={hideTip}
        >
          <title>Evolução temporal dos custos — previsão</title>
          <defs>
            <linearGradient
              id="temp-fill-mo"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={PAD_T}
              x2="0"
              y2={baseY}
            >
              <stop offset="0%" stopColor="var(--donut-mo)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--donut-mo)" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="temp-fill-eq"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={PAD_T}
              x2="0"
              y2={baseY}
            >
              <stop offset="0%" stopColor="var(--donut-eq)" stopOpacity="0.38" />
              <stop offset="100%" stopColor="var(--donut-eq)" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="temp-fill-mat"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={PAD_T}
              x2="0"
              y2={baseY}
            >
              <stop offset="0%" stopColor="var(--donut-mat)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--donut-mat)" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              id="temp-fill-forn"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={PAD_T}
              x2="0"
              y2={baseY}
            >
              <stop offset="0%" stopColor="var(--donut-forn)" stopOpacity="0.36" />
              <stop offset="100%" stopColor="var(--donut-forn)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tv, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={VB_W - PAD_R}
                y1={yAt(tv)}
                y2={yAt(tv)}
                stroke="var(--chart-grid-line)"
                strokeWidth={1}
                strokeDasharray="5 6"
                opacity={0.9}
              />
              <text
                x={PAD_L - 10}
                y={yAt(tv)}
                dy="0.35em"
                textAnchor="end"
                className="fill-(--muted) text-[11px] tabular-nums"
              >
                {formatBRLAxis(tv)}
              </text>
            </g>
          ))}

          {tip && (
            <line
              x1={xAt(tip.index)}
              x2={xAt(tip.index)}
              y1={PAD_T}
              y2={baseY}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={1}
            />
          )}

          {points.map((_, i) => (
            <text
              key={points[i]!.monthKey}
              x={xAt(i)}
              y={VB_H - PAD_B + 20}
              textAnchor="end"
              transform={`rotate(-40 ${xAt(i)} ${VB_H - PAD_B + 20})`}
              className="fill-(--muted) text-[11px]"
            >
              {points[i]!.label}
            </text>
          ))}

          {(
            [
              ["mat", "url(#temp-fill-mat)"],
              ["eq", "url(#temp-fill-eq)"],
              ["forn", "url(#temp-fill-forn)"],
              ["mo", "url(#temp-fill-mo)"],
            ] as const
          ).map(([key, fillUrl]) => {
            const d = linePaths[key];
            if (!d) return null;
            return (
              <path
                key={`area-${key}`}
                d={areaPathUnder(d, baseY, lastX, firstX)}
                fill={fillUrl}
              />
            );
          })}

          {seriesMeta.map(({ key, stroke }) => (
            <path
              key={key}
              d={linePaths[key]}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {tip &&
            seriesMeta.map(({ key, stroke }) => (
              <circle
                key={`dot-${key}`}
                cx={xAt(tip.index)}
                cy={yAt(tip.p[key])}
                r={5}
                fill={stroke}
                stroke="var(--card)"
                strokeWidth={1.5}
              />
            ))}

          {!tip &&
            seriesMeta.map(({ key, stroke }) =>
              points.map((p, i) => (
                <circle
                  key={`${key}-${p.monthKey}`}
                  cx={xAt(i)}
                  cy={yAt(p[key])}
                  r={3.5}
                  fill={stroke}
                  stroke="var(--card)"
                  strokeWidth={1}
                  opacity={0.75}
                />
              )),
            )}
        </svg>

        {tip && (
          <div
            className="pointer-events-none fixed z-100 max-w-[min(92vw,260px)] rounded-xl border border-(--border) bg-[#121212]/95 px-3.5 py-2.5 text-left text-xs shadow-2xl ring-1 ring-white/10 backdrop-blur-sm"
            style={{
              left: tip.clientX + 14,
              top: tip.clientY + 14,
            }}
          >
            <div className="font-semibold text-(--text)">{tip.p.label}</div>
            <div className="mt-0.5 text-[10px] text-(--muted)">
              Previsão acumulada (orçamento dashboard)
            </div>
            <div className="mt-2 space-y-1">
              <div style={{ color: "var(--donut-mo)" }}>
                Mão de Obra: {formatBRL(tip.p.mo)}
              </div>
              <div style={{ color: "var(--donut-eq)" }}>
                Equipamento: {formatBRL(tip.p.eq)}
              </div>
              <div style={{ color: "var(--donut-mat)" }}>
                Materiais: {formatBRL(tip.p.mat)}
              </div>
              <div style={{ color: "var(--donut-forn)" }}>
                Fornecimento: {formatBRL(tip.p.forn)}
              </div>
              <div className="mt-1.5 border-t border-white/10 pt-1.5 font-semibold text-(--text)">
                Total: {formatBRL(tip.p.total)}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
