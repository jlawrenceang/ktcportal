import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { tl } from './translations'
import { enSimple } from './translations-en'
import { useAuth } from './AuthContext'

// Lightweight, dependency-free i18n. English is the source of truth and the
// translation KEY: components wrap user-facing strings with t('English text'),
// and the Tagalog dictionary (translations.ts) maps that English string to its
// Tagalog. Anything not in the dictionary falls back to English automatically,
// so the app is always shippable mid-translation.
//
// Default is English; the chosen language VALUE is remembered per browser
// (device preference). Whether a given ACCOUNT has been asked to choose is
// tracked PER USER, so the first-run language chooser fires once for every
// account — important for shared / kiosk devices.
// Interpolation: t('Hello {name}', { name }) replaces {name} in either language.

export type Lang = 'en' | 'tl'
const KEY = 'ktc_lang'                                       // language value — per browser
const chosenKeyFor = (uid: string) => `ktc_lang_chosen_${uid}` // "has this account picked?" — per account
const setupDoneKeyFor = (uid: string) => `ktc_setup_done_${uid}` // "has this account finished first-run setup?" — per account

export type TFunc = (en: string, vars?: Record<string, string | number>) => string

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  // True once the user has explicitly picked a language (via first-run setup or
  // the nav toggle). Used by the nav toggle / login screen.
  langChosen: boolean
  // True once the account has finished the one-time first-run SETUP modal
  // (language + notifications). Gates the demo tour so it runs AFTER setup.
  setupDone: boolean
  completeSetup: () => void
  t: TFunc
}

const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, langChosen: false, setupDone: false, completeSetup: () => {}, t: (s) => s })

export function useT() { return useContext(Ctx) }

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'tl' ? 'tl' : 'en'
  } catch {
    return 'en'
  }
}
export function I18nProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user?.id ?? null
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [tick, setTick] = useState(0) // bump to re-read the per-account flag after a pick

  // Has THIS signed-in account explicitly chosen a language yet? No session
  // (login / confirm screens) → treat as chosen so we never gate those.
  const langChosen = useMemo(() => {
    if (!uid) return true
    try { return localStorage.getItem(chosenKeyFor(uid)) === '1' } catch { return true }
  }, [uid, tick])

  // Has THIS account finished first-run setup (language + notifications)? No
  // session (login / confirm screens) → treat as done so we never gate those.
  const setupDone = useMemo(() => {
    if (!uid) return true
    try { return localStorage.getItem(setupDoneKeyFor(uid)) === '1' } catch { return true }
  }, [uid, tick])

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l)
      if (uid) localStorage.setItem(chosenKeyFor(uid), '1')
    } catch { /* ignore */ }
    setLangState(l)
    setTick((n) => n + 1)
  }, [uid])

  // Mark the one-time first-run setup as finished for this account; the tour
  // (gated on setupDone) then runs next.
  const completeSetup = useCallback(() => {
    try { if (uid) localStorage.setItem(setupDoneKeyFor(uid), '1') } catch { /* ignore */ }
    setTick((n) => n + 1)
  }, [uid])

  const t = useCallback<TFunc>((en, vars) => {
    // tl: Tagalog/Taglish → simplified-English fallback → raw key.
    // en: simplified English → raw key. (Override files keyed by the raw key.)
    const out = lang === 'tl' ? (tl[en] ?? enSimple[en] ?? en) : (enSimple[en] ?? en)
    return interpolate(out, vars)
  }, [lang])
  return <Ctx.Provider value={{ lang, setLang, langChosen, setupDone, completeSetup, t }}>{children}</Ctx.Provider>
}
