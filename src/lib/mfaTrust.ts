import { supabase } from './supabase'

const TRUSTED_MFA_KEY = 'ktc_mfa_trusted_device_v1'

function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function getTrustedMfaToken() {
  try {
    return localStorage.getItem(TRUSTED_MFA_KEY)
  } catch {
    return null
  }
}

export function clearTrustedMfaToken() {
  try {
    localStorage.removeItem(TRUSTED_MFA_KEY)
  } catch {
    // Browser storage can be unavailable in private or embedded contexts.
  }
}

function ensureTrustedMfaToken() {
  const existing = getTrustedMfaToken()
  if (existing) return existing
  const token = randomToken()
  try {
    localStorage.setItem(TRUSTED_MFA_KEY, token)
  } catch {
    return token
  }
  return token
}

export async function trustCurrentMfaDevice() {
  const token = ensureTrustedMfaToken()
  const label = typeof navigator === 'undefined'
    ? 'Browser'
    : [navigator.platform, navigator.userAgent].filter(Boolean).join(' ').slice(0, 120)
  const { error } = await supabase.rpc('trust_mfa_device', { p_token: token, p_label: label || 'Browser' })
  if (error) throw error
}

export async function resumeTrustedMfaSession() {
  const token = getTrustedMfaToken()
  if (!token) return false
  const { data, error } = await supabase.rpc('resume_trusted_mfa_session', { p_token: token })
  if (error) return false
  if (data !== true) {
    clearTrustedMfaToken()
    return false
  }
  return true
}
