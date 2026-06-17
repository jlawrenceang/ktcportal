// send-push — delivers Web Push notifications to stored browser subscriptions.
//
// Trigger: an AFTER INSERT trigger on notifications / staff_notifications
// (migration 0114) POSTs here via pg_net with the x-push-secret header and a
// body of { user_ids: uuid[], title, body, url }. We look up every push
// subscription for those users and send the (VAPID-signed, encrypted) push.
// Dead subscriptions (404/410) are pruned.
//
// Required function secrets (scripts/setup-push.mjs sets them):
//   PUSH_SECRET        — shared secret the trigger sends as x-push-secret
//   VAPID_PUBLIC_KEY   — VAPID application server public key (base64url)
//   VAPID_PRIVATE_KEY  — VAPID private key (base64url)
//   VAPID_SUBJECT      — mailto: or https: contact (optional)
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const PUSH_SECRET = Deno.env.get('PUSH_SECRET') ?? ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:portal@ktcterminal.com'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  if (!PUSH_SECRET || req.headers.get('x-push-secret') !== PUSH_SECRET) return json({ error: 'unauthorized' }, 401)
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'push not configured' }, 200)

  let payloadIn: { user_ids?: string[]; title?: string; body?: string; url?: string }
  try { payloadIn = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const userIds = Array.isArray(payloadIn.user_ids) ? payloadIn.user_ids.filter((x) => typeof x === 'string') : []
  if (userIds.length === 0) return json({ sent: 0 })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (error) return json({ error: error.message }, 500)

  const payload = JSON.stringify({
    title: payloadIn.title || 'KTC Online Portal',
    body: payloadIn.body || '',
    url: payloadIn.url || '/',
  })

  let sent = 0
  const dead: string[] = []
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode ?? 0
      if (code === 404 || code === 410) dead.push(s.id)
    }
  }))
  if (dead.length) await sb.from('push_subscriptions').delete().in('id', dead)

  return json({ sent, pruned: dead.length })
})
