import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { tl } from './translations'

// Lightweight, dependency-free i18n. English is the source of truth and the
// translation KEY: components wrap user-facing strings with t('English text'),
// and the Tagalog dictionary (translations.ts) maps that English string to its
// Tagalog. Anything not in the dictionary falls back to English automatically,
// so the app is always shippable mid-translation.
//
// Default is English; the choice is remembered per browser (localStorage).
// Interpolation: t('Hello {name}', { name }) replaces {name} in either language.

export type Lang = 'en' | 'tl'
const KEY = 'ktc_lang'

export type TFunc = (en: string, vars?: Record<string, string | number>) => string

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: TFunc
}

const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (s) => s })

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
  const [lang, setLangState] = useState<Lang>(initialLang)
  const setLang = useCallback((l: Lang) => {
    try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
    setLangState(l)
  }, [])
  const t = useCallback<TFunc>((en, vars) => {
    const out = lang === 'tl' ? (tl[en] ?? en) : en
    return interpolate(out, vars)
  }, [lang])
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}
