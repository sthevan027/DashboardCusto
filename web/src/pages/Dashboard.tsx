import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getErrorMessage } from '../lib/supabaseError'
import { formatBRL } from '../lib/money'

type GroupRow = {
  group_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
}

type SubgroupRow = {
  group_name: string
  subgroup_name: string
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

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'OVERBUDGET':
      return 'bg-rose-500/20 text-rose-200 ring-rose-400/40'
    case 'CRITICAL':
      return 'bg-amber-500/20 text-amber-100 ring-amber-400/40'
    case 'WARNING':
      return 'bg-yellow-500/15 text-yellow-100 ring-yellow-400/35'
    default:
      return 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/35'
  }
}

function formatMonthLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

export function Dashboard() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [subgroups, setSubgroups] = useState<SubgroupRow[]>([])
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

  const maxMonthValue = useMemo(() => {
    if (months.length === 0) return 1
    return Math.max(...months.map((m) => Number(m.actual_value)), 1)
  }, [months])

  useEffect(() => {
    let ok = true
    ;(async () => {
      setErr(null)
      setLoading(true)
      try {
        const [g, sg, a, m] = await Promise.all([
          supabase.from('vw_group_cost_summary').select('*').order('group_name'),
          supabase
            .from('vw_subgroup_cost_summary')
            .select('*')
            .order('group_name')
            .order('subgroup_name'),
          supabase.from('vw_activity_cost_analysis').select('*'),
          supabase.from('vw_monthly_total_actuals').select('*').order('month'),
        ])
        if (g.error) throw g.error
        if (sg.error) throw sg.error
        if (a.error) throw a.error
        if (m.error) throw m.error
        if (!ok) return
        setGroups((g.data ?? []) as GroupRow[])
        setSubgroups((sg.data ?? []) as SubgroupRow[])
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
        if (ok) setErr(getErrorMessage(e))
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

  const semDados =
    totals != null &&
    totals.planned === 0 &&
    totals.actual === 0 &&
    groups.length === 0

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text)]">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Resumo por grupo e subgrupo, maiores consumos por atividade e evolução mensal (Total).
        </p>
      </div>

      {semDados && (
        <div className="rounded-xl border border-amber-400/60 bg-amber-50 p-4 text-left text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Nenhum dado apareceu (tudo zerado)</p>
          <p className="mt-2 text-sm">
            No Supabase isso costuma ser <strong>RLS</strong> sem política (a API devolve 0 linhas) ou o
            projeto ainda <strong>sem seed</strong>.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              Rode no SQL Editor o arquivo <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">Supabase/rls_policies.sql</code>
            </li>
            <li>
              Confirme que rodou <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">schema.sql</code>, <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">seed.generated.sql</code> e que as views existem
            </li>
            <li>
              Use a chave <strong>anon</strong> (não service_role) no <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">web/.env</code> e reinicie o <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">pnpm dev</code>
            </li>
          </ol>
        </div>
      )}

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
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Por subgrupo</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Soma dos itens (exceto grupo Total), agrupada por grupo + subgrupo.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/80">
                <th className="px-3 py-2 text-left font-medium">Grupo</th>
                <th className="px-3 py-2 text-left font-medium">Subgrupo</th>
                <th className="px-3 py-2 text-right font-medium">Previsto</th>
                <th className="px-3 py-2 text-right font-medium">Real</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {subgroups.map((r) => (
                <tr
                  key={`${r.group_name}-${r.subgroup_name}`}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="px-3 py-2">{r.group_name}</td>
                  <td className="max-w-[200px] truncate px-3 py-2" title={r.subgroup_name}>
                    {r.subgroup_name}
                  </td>
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
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Maior consumo (%)</h2>
          <p className="text-sm text-[var(--muted)]">
            Atividades (código) — top 5 · valores em R$
          </p>
          <ul className="mt-3 space-y-3">
            {risks.map((r) => (
              <li
                key={r.item_id}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm"
              >
                <div className="font-medium leading-snug">
                  {r.item_code} · {r.item_name.slice(0, 72)}
                  {r.item_name.length > 72 ? '…' : ''}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <span className="text-[var(--muted)]">Previsto</span>
                    <div className="tabular-nums font-medium">{formatBRL(r.planned_value)}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Real</span>
                    <div className="tabular-nums font-medium">{formatBRL(r.actual_value)}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Saldo</span>
                    <div className="tabular-nums font-medium">{formatBRL(r.balance)}</div>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">% · status</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular-nums font-medium">
                        {r.percent_used != null
                          ? `${(Number(r.percent_used) * 100).toFixed(2)}%`
                          : '—'}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ${statusBadgeClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Evolução mensal (Total)</h2>
          <p className="text-sm text-[var(--muted)]">
            Barras proporcionais ao maior mês — maior barra = maior custo naquele mês.
          </p>
          <div className="mt-4 space-y-3">
            {months.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Sem lançamentos ainda.</p>
            )}
            {months.map((row) => {
              const v = Number(row.actual_value)
              const pct = maxMonthValue > 0 ? (v / maxMonthValue) * 100 : 0
              return (
                <div key={row.month} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs sm:text-sm">
                    <span className="min-w-[88px] font-medium capitalize text-[var(--muted)]">
                      {formatMonthLabel(row.month)}
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold">
                      {formatBRL(row.actual_value)}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700/50 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
