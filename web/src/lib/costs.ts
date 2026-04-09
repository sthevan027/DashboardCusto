import type { SupabaseClient } from '@supabase/supabase-js'

/** Substitui todos os lançamentos do item por um único valor (ajuste manual na tela Visual). */
export async function replaceItemActualWithManualTotal(
  client: SupabaseClient,
  itemId: number,
  amount: number,
  costDate: string
) {
  const { error: delErr } = await client
    .from('costs')
    .delete()
    .eq('item_id', itemId)
  if (delErr) throw delErr

  const { error: insErr } = await client.from('costs').insert({
    item_id: itemId,
    cost_date: costDate,
    amount,
    description: 'Ajuste manual (tela Visual)',
    external_id: 'MANUAL_UI_TOTAL',
  })
  if (insErr) throw insErr
}
