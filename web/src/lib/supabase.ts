import { createClient } from '@supabase/supabase-js'
import { isStandalone } from './presentationMode'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!isStandalone() && (!url || !anon)) {
  console.warn(
    'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env',
  )
}

export const supabase = createClient(url ?? '', anon ?? '', {
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
