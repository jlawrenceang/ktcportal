import { supabase } from './supabase'

// Realtime "a new login just claimed this account" nudge. The new session
// broadcasts on a per-user channel after claim_session(); every other session
// listening on it re-checks is_current_session() immediately (instead of
// waiting up to 60s for the poll). The broadcast carries NO authority — it
// only says "wake up and re-check"; the server (is_current_session /
// session_alive) decides who actually gets signed out. So a spoofed nudge can,
// at worst, make a still-valid session run one extra check and stay.

export const sessionChannelName = (userId: string) => `session-claim:${userId}`

/** Fire-and-forget: tell other sessions of this account to re-check now. */
export function broadcastSessionClaimed(userId: string) {
  const ch = supabase.channel(sessionChannelName(userId), { config: { broadcast: { ack: false } } })
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return
    void ch.send({ type: 'broadcast', event: 'claimed', payload: {} })
    // Let the message flush, then drop the transient channel.
    setTimeout(() => { void supabase.removeChannel(ch) }, 1500)
  })
}
