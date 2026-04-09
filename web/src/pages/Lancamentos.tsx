import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseBRLInput } from '../lib/money'

type Lookup = {
  item_id: number
  item_code: string | null
  item_name: string
  group_name: string
  subgroup_name: string | null
}

export function Lancamentos() {
  const [items, setItems] = useState<Lookup[]>([])
  const [itemId, setItemId] = useState<number | ''>('')
  const [costDate, setCostDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [amountStr, setAmountStr] = useState('')
  const [description, setDescription] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setErr(null)
      const { data, error } = await supabase
        .from('vw_item_lookup')
        .select('*')
        .order('item_code')
      if (error) {
        setErr(error.message)
        setLoading(false)
        return
      }
      setItems((data ?? []) as Lookup[])
      setLoading(false)
    })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    if (itemId === '') {
      setErr('Selecione um item.')
      return
    }
    const amount = parseBRLInput(amountStr)
    if (amount == null || amount < 0) {
      setErr('Informe um valor válido.')
      return
    }
    const { error } = await supabase.from('costs').insert({
      item_id: itemId as number,
      cost_date: costDate,
      amount,
      description: description.trim() || null,
      external_id: `UI-${Date.now()}`,
    })
    if (error) {
      setErr(error.message)
      return
    }
    setMsg('Lançamento registrado.')
    setAmountStr('')
    setDescription('')
  }

  if (loading) {
    return <p className="text-[var(--muted)]">Carregando itens…</p>
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lançamentos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Registra custo real (mês a mês) em <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">costs</code>.
          O item precisa ter orçamento.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/50 dark:text-red-100">
          {err}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          {msg}
        </div>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium">Item</span>
          <select
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            value={itemId === '' ? '' : String(itemId)}
            onChange={(e) =>
              setItemId(e.target.value ? Number(e.target.value) : '')
            }
            required
          >
            <option value="">Selecione…</option>
            {items.map((r) => (
              <option key={r.item_id} value={r.item_id}>
                {r.item_code ?? '—'} · {r.group_name} / {r.subgroup_name ?? '—'} —{' '}
                {r.item_name.slice(0, 60)}
                {r.item_name.length > 60 ? '…' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Data (competência)</span>
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            value={costDate}
            onChange={(e) => setCostDate(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Valor (R$)</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm tabular-nums"
            placeholder="1.234,56"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Descrição (opcional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Salvar lançamento
        </button>
      </form>

      <p className="text-xs text-[var(--muted)]">
        Dica: o valor digitado será somado ao realizado do item. Para substituir
        tudo por um único número (como na planilha), use a tela{' '}
        <strong>Visual (Dados)</strong>.
      </p>
    </div>
  )
}
