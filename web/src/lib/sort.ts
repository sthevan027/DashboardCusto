/** Ordena códigos tipo 1.2.10 vs 1.2.3 corretamente */
export function compareItemCode(a: string | null, b: string | null): number {
  const ca = a ?? ''
  const cb = b ?? ''
  const pa = ca.split('.').map((x) => parseInt(x, 10) || 0)
  const pb = cb.split('.').map((x) => parseInt(x, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na !== nb) return na - nb
  }
  return 0
}

const GROUP_ORDER: Record<string, number> = {
  'Mão de Obra': 0,
  Equipamento: 1,
  Materiais: 2,
}

export function compareGroup(a: string, b: string): number {
  const oa = GROUP_ORDER[a] ?? 99
  const ob = GROUP_ORDER[b] ?? 99
  if (oa !== ob) return oa - ob
  return a.localeCompare(b, 'pt-BR')
}
