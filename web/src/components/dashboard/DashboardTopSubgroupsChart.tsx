import { useMemo } from 'react'
import type { SubgroupRow } from '../../lib/dashboardTypes'
import { formatBRL } from '../../lib/money'

type Row = SubgroupRow & { mag: number }

type Props = {
  subgroups: SubgroupRow[]
}

const PLOT_H = 200

function labelFor(s: SubgroupRow): string {
  const sub = s.subgroup_name.trim() || '—'
  return `${s.group_name} · ${sub}`
}

/** Altura em px: raiz quadrada reduz domínio de um único valor enorme e deixa o restante visível. */
function barHeightPx(value: number, maxMag: number, plotH: number): number {
  if (value <= 0 || maxMag <= 0) return 0
  const t = Math.sqrt(value) / Math.sqrt(maxMag)
  return Math.max(4, Math.round(t * plotH))
}

export function DashboardTopSubgroupsChart({ subgroups }: Props) {
  const { top10, maxMag } = useMemo(() => {
    const withMag: Row[] = subgroups.map((s) => ({
      ...s,
      mag: Math.max(Number(s.planned_value), Number(s.actual_value)),
    }))
    const sorted = [...withMag].sort((a, b) => b.mag - a.mag).slice(0, 10)
    const maxMag = sorted.length === 0 ? 1 : Math.max(...sorted.map((r) => r.mag), 1)
    return { top10: sorted, maxMag }
  }, [subgroups])

  if (top10.length === 0) {
    return (
      <section className="rounded-xl border border-(--border) bg-(--card) p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Onde está o maior custo (subgrupos)</h2>
        <p className="mt-2 text-sm text-(--muted)">Sem dados para o gráfico.</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-(--border) bg-(--card) p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Onde está o maior custo (subgrupos)</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-(--muted)">
            Top 10 pelo maior valor (orçado ou real). A altura das barras usa escala em{' '}
            <strong className="font-medium text-(--text)">raiz quadrada</strong>, para valores muito diferentes
            continuarem comparáveis — os números abaixo são sempre os valores reais.
          </p>
        </div>
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
      </div>

      <div className="mt-6 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <div
          className="flex min-w-min items-end justify-start gap-3 px-0.5 sm:gap-5"
          style={{ minHeight: PLOT_H + 88 }}
        >
          {top10.map((s) => {
            const p = Number(s.planned_value)
            const a = Number(s.actual_value)
            const hP = barHeightPx(p, maxMag, PLOT_H)
            const hA = barHeightPx(a, maxMag, PLOT_H)
            const lab = labelFor(s)
            return (
              <div
                key={`${s.group_name}-${s.subgroup_name}`}
                className="flex w-[100px] shrink-0 flex-col items-center gap-2 sm:w-[108px]"
              >
                <div
                  className="flex w-full items-end justify-center gap-2"
                  style={{ height: PLOT_H }}
                >
                  {/* Previsto — trilho só como guia fino; barra azul sólida */}
                  <div className="flex h-full w-[30%] max-w-[34px] min-w-[26px] flex-col justify-end">
                    <div
                      className="w-full rounded-t-md bg-blue-600 shadow-[inset_0_-1px_0_0_rgba(0,0,0,0.08)] dark:bg-blue-500"
                      style={{
                        height: hP,
                        minHeight: p > 0 ? 4 : 0,
                      }}
                      title={`Previsto: ${formatBRL(p)}`}
                    />
                  </div>
                  {/* Realizado — vermelho puro; sem fundo escuro que “apague” a cor */}
                  <div className="flex h-full w-[30%] max-w-[34px] min-w-[26px] flex-col justify-end">
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
                  className="w-full max-w-[112px] px-0.5 text-center text-[10px] leading-snug text-(--text) sm:max-w-[120px] sm:text-[11px]"
                  title={lab}
                >
                  <span className="line-clamp-4">{lab}</span>
                </p>
                <div className="w-full max-w-[120px] space-y-1 rounded-lg bg-slate-100/80 px-1.5 py-1.5 text-[9px] tabular-nums leading-tight text-(--muted) dark:bg-slate-800/60 sm:text-[10px]">
                  <div className="flex justify-between gap-1 border-b border-(--border)/50 pb-1 dark:border-slate-600/50">
                    <span className="shrink-0 text-blue-600 dark:text-blue-400">P</span>
                    <span className="min-w-0 text-right font-medium text-(--text)">{formatBRL(p)}</span>
                  </div>
                  <div className="flex justify-between gap-1">
                    <span className="shrink-0 text-red-600 dark:text-red-400">R</span>
                    <span className="min-w-0 text-right font-medium text-(--text)">{formatBRL(a)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
