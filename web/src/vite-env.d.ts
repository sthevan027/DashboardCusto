/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Obrigatório só se `VITE_STANDALONE=0`. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_CONTRACT_LABEL?: string
  /** `0` ou `false` liga Supabase; omitido ou outro valor = modo offline (padrão). */
  readonly VITE_STANDALONE?: string
  readonly VITE_DEMO_EMAIL?: string
  readonly VITE_DEMO_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
