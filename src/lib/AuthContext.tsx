import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface SignUpExtras {
  fullName?: string
  idFile?: File | null
}

interface AuthValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, extras?: SignUpExtras) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn: AuthValue['signIn'] = async (identifier, password) => {
    // staff log in with a username (no @) -> map to the synthetic staff email
    const email = identifier.includes('@')
      ? identifier.trim()
      : `${identifier.trim().toLowerCase()}@ktc-staff.local`
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }
  const signUp: AuthValue['signUp'] = async (email, password, extras) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: extras?.fullName ?? null } },
    })
    if (error) return { error: error.message }

    // Upload the valid ID if we already have a session (email confirmation off).
    // With confirmation on there's no session yet — the user uploads after first login.
    if (extras?.idFile && data.session && data.user) {
      const ext = extras.idFile.name.split('.').pop()?.toLowerCase() || 'dat'
      const path = `${data.user.id}/valid-id.${ext}`
      const { error: upErr } = await supabase.storage
        .from('valid-ids')
        .upload(path, extras.idFile, { upsert: true })
      if (!upErr) {
        await supabase.from('brokers').update({ valid_id_path: path }).eq('user_id', data.user.id)
      }
    }
    return { error: null }
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
