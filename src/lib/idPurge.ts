import { supabase } from './supabase'

// Lazy auto-purge of valid IDs past the 3-day retention maximum (0053):
// runs opportunistically when an ADMIN loads any back-office page, so the
// guarantee holds even before the server-side cron is configured. Throttled
// to once per hour per browser; fire-and-forget (failures retry next hour,
// and the cron is the backstop).

const THROTTLE_KEY = 'ktc_id_purge_at'
const HOUR = 3_600_000
const MAX_AGE_MS = 3 * 86_400_000

export function purgeExpiredIds(): void {
  try {
    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0)
    if (Date.now() - last < HOUR) return
    localStorage.setItem(THROTTLE_KEY, String(Date.now()))
  } catch {
    return
  }
  void (async () => {
    const cutoff = new Date(Date.now() - MAX_AGE_MS).toISOString()
    const { data } = await supabase
      .from('customers')
      .select('id, valid_id_path')
      .not('valid_id_path', 'is', null)
      .not('valid_id_uploaded_at', 'is', null)
      .lt('valid_id_uploaded_at', cutoff)
      .limit(25)
    for (const row of data ?? []) {
      const { error } = await supabase.storage.from('valid-ids').remove([row.valid_id_path as string])
      if (!error) {
        await supabase.from('customers').update({ valid_id_path: null }).eq('id', row.id)
      }
    }
  })()
}
