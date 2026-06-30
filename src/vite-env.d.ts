/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_TARGET?: string
  readonly VITE_PUBLIC_PORTAL_URL?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Build stamps injected by vite.config.ts `define`.
declare const __APP_COMMIT__: string
declare const __APP_BUILT__: string
