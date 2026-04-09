/** Supabase/PostgREST errors não são instâncias de Error — extrai mensagem útil. */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: string }).message
    if (typeof m === 'string' && m.length) return m
  }
  if (e && typeof e === 'object' && 'details' in e) {
    const d = (e as { details?: string }).details
    if (typeof d === 'string' && d.length) return d
  }
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}
