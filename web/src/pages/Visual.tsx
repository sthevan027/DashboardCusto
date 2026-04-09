import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatBRL, parseBRLInput } from '../lib/money'
import { replaceItemActualWithManualTotal } from '../lib/costs'
import { getErrorMessage } from '../lib/supabaseError'
import { compareGroup, compareItemCode } from '../lib/sort'

type Activity = {
  item_id: number
  item_name: string
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
  item_code: string | null
}

type Breakdown = {
  item_id: number
  item_name: string
  group_name: string
  item_code: string | null
  subgroup_id: number | null
  subgroup_name: string | null
  planned_value: number
  actual_value: number
  balance: number
  percent_used: number | null
  status: string
}

export function Visual() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [breakdown, setBreakdown] = useState<Breakdown[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const byCode = useMemo(() => {
    const m = new Map<string, Breakdown[]>()
    for (const b of breakdown) {
      const c = b.item_code ?? ''
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(b)
    }
    for (const [, arr] of m) {
      arr.sort(
        (a, b) =>
          compareGroup(a.group_name, b.group_name) ||
          (a.subgroup_name ?? '').localeCompare(b.subgroup_name ?? '', 'pt-BR')
      )
    }
    return m
  }, [breakdown])

  const load = useCallback(async () => {
    setErr(null)
    const [a, b] = await Promise.all([
      supabase.from('vw_activity_cost_analysis').select('*'),
      supabase.from('vw_visual_dados').select('*'),
    ])
    if (a.error) throw a.error
    if (b.error) throw b.error
    setActivities(((a.data ?? []) as Activity[]).sort((x, y) =>
      compareItemCode(x.item_code, y.item_code)
    ))
    setBreakdown((b.data ?? []) as Breakdown[])
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        await load()
      } catch (e: unknown) {
        setErr(getErrorMessage(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [load])

  async function savePlanned(itemId: number, raw: string) {
    const v = parseBRLInput(raw)
    if (v == null || v < 0) {
      setErr('Valor previsto inválido.')
      return
    }
    setSaving(`p-${itemId}`)
    setErr(null)
    const { error } = await supabase
      .from('budgets')
      .update({ planned_value: v })
      .eq('item_id', itemId)
    setSaving(null)
    if (error) {
      setErr(error.message)
      return
    }
    await load()
  }

  async function saveActual(itemId: number, raw: string) {
    const v = parseBRLInput(raw)
    if (v == null || v < 0) {
      setErr('Valor real inválido.')
      return
    }
    setSaving(`a-${itemId}`)
    setErr(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await replaceItemActualWithManualTotal(supabase, itemId, v, today)
      await load()
    } catch (e: unknown) {
      setErr(getErrorMessage(e))
    } finally {
      setSaving(null)
    }
  }

  async function saveSubgroupName(subgroupId: number | null, raw: string) {
    if (subgroupId == null) return
    setSaving(`sg-${subgroupId}`)
    setErr(null)
    const { error } = await supabase
      .from('subgroups')
      .update({ name: raw.trim() })
      .eq('id', subgroupId)
    setSaving(null)
    if (error) {
      setErr(error.message)
      return
    }
    await load()
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Carregando planilha…</p>
  }

  if (err && activities.length === 0) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 dark:bg-red-950/40">
        {err}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visual — aba Dados</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Mesma lógica do Excel: total por código (laranja) e linhas por grupo/subgrupo
          (Mão de Obra / Equipamento / Materiais). Edite previsto ou real e salve no botão
          ou Enter.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/30">
          {err}
        </div>
      )}

      <div className="space-y-10 overflow-x-auto">
        {activities.map((act) => {
          const code = act.item_code ?? ''
          const rows = byCode.get(code) ?? []
          return (
            <section key={act.item_id} className="min-w-[720px]">
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-slate-100 dark:bg-slate-800">
                      <th className="px-2 py-2 text-left font-semibold">Itens</th>
                      <th className="px-2 py-2 text-left font-semibold">Descrição / Sub-Grupo</th>
                      <th className="px-2 py-2 text-right font-semibold">Total previsto</th>
                      <th className="px-2 py-2 text-right font-semibold">Total real</th>
                      <th className="px-2 py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[var(--row-orange)]">
                      <td className="border-b border-[var(--border)] px-2 py-2 font-mono text-xs">
                        {act.item_code}
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-2 font-medium">
                        {act.item_name}
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-2 text-right align-top">
                        <InlineMoney
                          defaultValue={act.planned_value}
                          disabled={!!saving}
                          onSave={(v) => savePlanned(act.item_id, v)}
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-2 text-right align-top">
                        <InlineMoney
                          defaultValue={act.actual_value}
                          disabled={!!saving}
                          onSave={(v) => saveActual(act.item_id, v)}
                        />
                      </td>
                      <td className="border-b border-[var(--border)] px-2 py-2 text-xs text-[var(--muted)]">
                        {act.status}
                      </td>
                    </tr>

                    {rows.map((r) => (
                      <tr key={r.item_id} className="bg-white dark:bg-slate-900/40">
                        <td className="border-b border-[var(--border)] px-2 py-1.5"></td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5">
                          <div className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                            {r.group_name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[var(--muted)]">Sub:</span>
                            <input
                              defaultValue={r.subgroup_name ?? ''}
                              className="max-w-[280px] flex-1 rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-sm"
                              disabled={r.subgroup_id == null || !!saving}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur()
                                }
                              }}
                              onBlur={(e) => {
                                const nv = e.target.value.trim()
                                if (nv && nv !== (r.subgroup_name ?? '') && r.subgroup_id) {
                                  void saveSubgroupName(r.subgroup_id, nv)
                                }
                              }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-[var(--muted)] line-clamp-2">
                            {r.item_name}
                          </div>
                        </td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5 text-right align-top">
                          <InlineMoney
                            defaultValue={r.planned_value}
                            disabled={!!saving}
                            onSave={(v) => savePlanned(r.item_id, v)}
                          />
                        </td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5 text-right align-top">
                          <InlineMoney
                            defaultValue={r.actual_value}
                            disabled={!!saving}
                            onSave={(v) => saveActual(r.item_id, v)}
                          />
                        </td>
                        <td className="border-b border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted)]">
                          {r.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function InlineMoney({
  defaultValue,
  disabled,
  onSave,
}: {
  defaultValue: number
  disabled: boolean
  onSave: (raw: string) => void
}) {
  const [val, setVal] = useState(() => formatBRL(defaultValue))

  useEffect(() => {
    setVal(formatBRL(defaultValue))
  }, [defaultValue])

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:justify-end">
      <input
        className="w-full min-w-[120px] max-w-[160px] rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-right text-sm tabular-nums"
        value={val}
        disabled={disabled}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onSave(val)
          }
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className="shrink-0 rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
        onClick={() => onSave(val)}
      >
        Salvar
      </button>
    </div>
  )
}
