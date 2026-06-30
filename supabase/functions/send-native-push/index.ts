// send-native-push - FCM delivery for the internal Capacitor Android app.
//
// Dormant until deployed and armed with Vault rows native_push_url/native_push_secret
// plus Firebase service-account secrets. Web push remains handled by send-push.
import { JWT } from 'npm:google-auth-library@9'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SECRET = Deno.env.get('NATIVE_PUSH_SECRET') ?? ''
const PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? ''
const CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? ''
const PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function accessToken() {
  const jwt = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  const token = await jwt.getAccessToken()
  if (!token.token) throw new Error('Firebase access token unavailable')
  return token.token
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  if (!SECRET || req.headers.get('x-native-push-secret') !== SECRET) return json({ error: 'unauthorized' }, 401)
  if (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY) return json({ error: 'native push not configured' }, 200)

  let payloadIn: { user_ids?: string[]; title?: string; body?: string; url?: string }
  try { payloadIn = await req.json() } catch { return json({ error: 'bad json' }, 400) }
  const userIds = Array.isArray(payloadIn.user_ids) ? payloadIn.user_ids.filter((x) => typeof x === 'string') : []
  if (userIds.length === 0) return json({ sent: 0 })

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: rows, error } = await sb
    .from('native_push_tokens')
    .select('id, token')
    .eq('enabled', true)
    .in('user_id', userIds)
  if (error) return json({ error: error.message }, 500)

  const bearer = await accessToken()
  const endpoint = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`
  let sent = 0
  const dead: string[] = []

  await Promise.all((rows ?? []).map(async (r) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({
        message: {
          token: r.token,
          notification: {
            title: payloadIn.title || 'KTC Online Portal',
            body: payloadIn.body || '',
          },
          data: { url: payloadIn.url || '/' },
          android: { priority: 'HIGH' },
        },
      }),
    })
    if (res.ok) { sent++; return }
    const txt = await res.text().catch(() => '')
    if (res.status === 404 || txt.includes('UNREGISTERED') || txt.includes('INVALID_ARGUMENT')) dead.push(r.id)
  }))

  if (dead.length) await sb.from('native_push_tokens').update({ enabled: false }).in('id', dead)
  return json({ sent, disabled: dead.length })
})
