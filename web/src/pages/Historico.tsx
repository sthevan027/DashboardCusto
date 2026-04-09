import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type AuditRow = {
  id: number
  cost_id: number | null
  action: string
  changed_at: string
  changed_by: string | null
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

export function Historico() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setErr(null)
      const { data, error } = await supabase
        .from('costs_audit')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(200)
      if (error) {
        setErr(error.message)
        setLoading(false)
        return
      }
      setRows((data ?? []) as AuditRow[])
      setLoading(false)
    })()
  }, [])

  if (loading) {
    return <p className="text-[var(--muted)]">Carregando histórico…</p>
  }

  if (err) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-medium">Não foi possível ler o histórico</p>
        <p className="mt-1 text-sm">{err}</p>
        <p className="mt-2 text-sm">
          No Supabase, habilite leitura em <code className="rounded bg-amber-100 px-1">costs_audit</code> para o papel{' '}
          <code className="rounded bg-amber-100 px-1">anon</code> (RLS) ou use usuário autenticado.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Histórico de lançamentos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Auditoria de INSERT/UPDATE/DELETE em <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">costs</code> — data e hora em{' '}
          <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">changed_at</code>.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50 dark:bg-slate-800/80">
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Ação</th>
              <th className="px-3 py-2 font-medium">cost_id</th>
              <th className="px-3 py-2 font-medium">Usuário</th>
              <th className="px-3 py-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border)] align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[var(--muted)]">
                  {new Date(r.changed_at).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-2 font-medium">{r.action}</td>
                <td className="px-3 py-2 tabular-nums">{r.cost_id ?? '—'}</td>
                <td className="max-w-[120px] truncate px-3 py-2 text-xs text-[var(--muted)]">
                  {r.changed_by ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <pre className="max-h-24 overflow-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-900">
                    {r.action === 'DELETE'
                      ? JSON.stringify(r.old_row, null, 0)
                      : JSON.stringify(r.new_row ?? r.old_row, null, 0)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
