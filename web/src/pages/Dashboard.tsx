import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatBRL } from '../lib/money'

type GroupRow = {
  group_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
}

type ActivityRow = {
  item_id: number
  item_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
  item_code: string | null
}

type MonthRow = { month: string; actual_value: number }

export function Dashboard() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [totals, setTotals] = useState<{
    planned: number
    actual: number
    balance: number
    pct: number | null
  } | null>(null)
  const [risks, setRisks] = useState<ActivityRow[]>([])
  const [months, setMonths] = useState<MonthRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ok = true
    ;(async () => {
      setErr(null)
      setLoading(true)
      try {
        const [g, a, m] = await Promise.all([
          supabase.from('vw_group_cost_summary').select('*').order('group_name'),
          supabase.from('vw_activity_cost_analysis').select('*'),
          supabase.from('vw_monthly_total_actuals').select('*').order('month'),
        ])
        if (g.error) throw g.error
        if (a.error) throw a.error
        if (m.error) throw m.error
        if (!ok) return
        setGroups((g.data ?? []) as GroupRow[])
        const acts = (a.data ?? []) as ActivityRow[]
        const p = acts.reduce((s, r) => s + Number(r.planned_value), 0)
        const ac = acts.reduce((s, r) => s + Number(r.actual_value), 0)
        const bal = p - ac
        const pct = p > 0 ? ac / p : null
        setTotals({ planned: p, actual: ac, balance: bal, pct })
        const top = [...acts]
          .filter((r) => r.percent_used != null)
          .sort((x, y) => Number(y.percent_used) - Number(x.percent_used))
          .slice(0, 5)
        setRisks(top)
        setMonths((m.data ?? []) as MonthRow[])
      } catch (e: unknown) {
        if (ok) setErr(e instanceof Error ? e.message : 'Erro ao carregar')
      } finally {
        if (ok) setLoading(false)
      }
    })()
    return () => {
      ok = false
    }
  }, [])

  if (loading) {
    return (
      <p className="text-[var(--muted)]">Carregando indicadores…</p>
    )
  }

  if (err) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950/40 dark:text-red-100">
        <p className="font-medium">Não foi possível conectar ao Supabase</p>
        <p className="mt-1 text-sm">{err}</p>
        <p className="mt-2 text-sm">
          Confira <code className="rounded bg-red-100 px-1 dark:bg-red-900">web/.env</code> com{' '}
          <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_URL</code> e{' '}
          <code className="rounded bg-red-100 px-1 dark:bg-red-900">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Resumo por grupo (exclui duplicidade do grupo Total) e risco por atividade.
        </p>
      </div>

      {totals && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Total previsto
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totals.planned)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Total real
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totals.actual)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Saldo
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatBRL(totals.balance)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              % consumido
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {totals.pct != null ? `${(totals.pct * 100).toFixed(2)}%` : '—'}
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">Por grupo</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/80">
                <th className="px-3 py-2 text-left font-medium">Grupo</th>
                <th className="px-3 py-2 text-right font-medium">Previsto</th>
                <th className="px-3 py-2 text-right font-medium">Real</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((r) => (
                <tr
                  key={r.group_name}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-3 py-2">{r.group_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(r.planned_value)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(r.actual_value)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatBRL(r.balance)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.percent_used != null
                      ? `${(Number(r.percent_used) * 100).toFixed(1)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Maior consumo (%)</h2>
          <p className="text-sm text-[var(--muted)]">Atividades (código) — top 5</p>
          <ul className="mt-3 space-y-2">
            {risks.map((r) => (
              <li
                key={r.item_id}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {r.item_code} · {r.item_name.slice(0, 72)}
                  {r.item_name.length > 72 ? '…' : ''}
                </div>
                <div className="mt-1 text-[var(--muted)]">
                  {r.percent_used != null
                    ? `${(Number(r.percent_used) * 100).toFixed(2)}% · ${r.status}`
                    : r.status}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Evolução mensal (Total)</h2>
          <p className="text-sm text-[var(--muted)]">Soma de lançamentos no grupo Total</p>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
            {months.length === 0 && (
              <li className="text-[var(--muted)]">Sem lançamentos ainda.</li>
            )}
            {months.map((r) => (
              <li
                key={r.month}
                className="flex justify-between rounded border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 tabular-nums"
              >
                <span>{r.month}</span>
                <span>{formatBRL(r.actual_value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
