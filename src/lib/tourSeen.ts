import { supabase } from './supabase'

// "Tour seen" is durable per ACCOUNT — customers.tour_seen, set by the
// mark_tour_seen RPC (migration 0065). A per-session flag also stops the tour
// re-opening on page remounts within one session (the DB flag only reflects on
// the next load).
const SESSION_KEY = 'ktc_tour_shown'

export function tourShownThisSession(): boolean {
  try { return sessionStorage.getItem(SESSION_KEY) === '1' } catch { return false }
}

export function markTourSeen() {
  try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
  void supabase.rpc('mark_tour_seen')
}
