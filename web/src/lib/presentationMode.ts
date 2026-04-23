/**
 * Modo offline (padrão): dados mockados + login de demonstração, sem Supabase.
 * Para usar banco e auth reais, defina `VITE_STANDALONE=0` e as chaves do Supabase.
 */
export function isStandalone(): boolean {
  const s = import.meta.env.VITE_STANDALONE;
  if (s === "0" || s === "false") return false;
  return true;
}

/** @deprecated use `isStandalone` */
export const isDemoMode = isStandalone;
