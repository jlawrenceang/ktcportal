import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface SignUpExtras {
  fullName?: string
  contactNumber?: string
  idFile?: File | null
  captchaToken?: string
  irrVersion?: string
  termsVersion?: string
  privacyVersion?: string
}

interface AuthValue {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string, captchaToken?: string) => Promise<{ error: string | null }>
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

  const signIn: AuthValue['signIn'] = async (identifier, password, captchaToken) => {
    // staff log in with a username (no @) -> map to the synthetic staff email
    const email = identifier.includes('@')
      ? identifier.trim()
      : `${identifier.trim().toLowerCase()}@ktc-staff.local`
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    return { error: error?.message ?? null }
  }
  const signUp: AuthValue['signUp'] = async (email, password, extras) => {
    const acceptedAt = new Date().toISOString()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // With email confirmation ON, the confirm link lands the broker on the
        // verify-ID page (upload valid ID; they can also skip to the portal).
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/verify-id` : undefined,
        // Consent is recorded on the auth user immediately — works even when there
        // is no session yet (email confirmation on). The valid ID + consent columns
        // are synced after first login (see PendingPanel), since storage/RLS need a session.
        data: {
          full_name: extras?.fullName ?? null,
          contact_number: extras?.contactNumber ?? null,
          irr_version: extras?.irrVersion ?? null,
          irr_accepted_at: extras?.irrVersion ? acceptedAt : null,
          terms_version: extras?.termsVersion ?? null,
          terms_accepted_at: extras?.termsVersion ? acceptedAt : null,
          privacy_consent_version: extras?.privacyVersion ?? null,
          privacy_consented_at: extras?.privacyVersion ? acceptedAt : null,
        },
        ...(extras?.captchaToken ? { captchaToken: extras.captchaToken } : {}),
      },
    })
    if (error) return { error: error.message }

    // With a session (email confirmation off), persist the valid ID + IRR
    // acceptance onto the broker row for admin visibility. Best-effort: the
    // brokers update silently no-ops if the 0011 columns aren't applied yet.
    if (data.session && data.user) {
      const updates: Record<string, unknown> = {}
      if (extras?.contactNumber) updates.contact_number = extras.contactNumber
      if (extras?.idFile) {
        const ext = extras.idFile.name.split('.').pop()?.toLowerCase() || 'dat'
        const path = `${data.user.id}/valid-id.${ext}`
        const { error: upErr } = await supabase.storage
          .from('valid-ids')
          .upload(path, extras.idFile, { upsert: true })
        if (!upErr) updates.valid_id_path = path
      }
      if (extras?.irrVersion) {
        updates.irr_version = extras.irrVersion
        updates.irr_accepted_at = acceptedAt
      }
      if (extras?.termsVersion) {
        updates.terms_version = extras.termsVersion
        updates.terms_accepted_at = acceptedAt
      }
      if (extras?.privacyVersion) {
        updates.privacy_consent_version = extras.privacyVersion
        updates.privacy_consented_at = acceptedAt
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('customers').update(updates).eq('user_id', data.user.id)
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
