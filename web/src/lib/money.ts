export function formatBRL(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(n)
}

export function parseBRLInput(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(/R\$\s?/i, '')
  if (!t) return null
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}
