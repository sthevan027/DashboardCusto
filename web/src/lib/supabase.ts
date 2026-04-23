import { createClient } from '@supabase/supabase-js'
import { isStandalone } from './presentationMode'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Só para o `createClient` não falhar: no modo demo o app não usa rede Supabase. */
const STANDALONE_PLACEHOLDER_URL = 'https://example.supabase.co'
const STANDALONE_PLACEHOLDER_ANON = 'ci-placeholder-key'

const urlTrim = url?.trim() ?? ''
const anonTrim = anon?.trim() ?? ''

const useDemoPlaceholders = isStandalone() && (!urlTrim || !anonTrim)
const effectiveUrl = useDemoPlaceholders ? STANDALONE_PLACEHOLDER_URL : urlTrim
const effectiveAnon = useDemoPlaceholders ? STANDALONE_PLACEHOLDER_ANON : anonTrim

if (!isStandalone() && (!urlTrim || !anonTrim)) {
  console.warn(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env',
  )
}

if (!isStandalone() && (!effectiveUrl || !effectiveAnon)) {
  throw new Error(
    'Produção com banco: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (e não use VITE_STANDALONE=0 sem eles).',
  )
}

export const supabase = createClient(effectiveUrl, effectiveAnon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage:
      typeof globalThis !== "undefined" && "localStorage" in globalThis
        ? globalThis.localStorage
        : undefined,
  },
})
