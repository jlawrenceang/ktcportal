// Admin-only: mint a one-time "set new password" link for a customer, for the
// admin to hand over directly (Viber/SMS/phone) when the customer can't use the
// self-service email reset — and as a spam-proof fallback (no email is sent
// from here). The link is single-use and expires per Auth's OTP expiry
// (default ~1h).
//
// Security: owner/admin ONLY, and never the owner failsafe account. The gateway
// requires a valid session (default verify_jwt); we additionally confirm the
// caller is admin/owner using the service-role key. Mirrors the boc-mirror
// function's runtime conventions.
//
// Invoked from the admin portal: supabase.functions.invoke('admin-reset-link',
//   { body: { customer_id, redirect_to } }).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Function not configured.' }, 500)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Missing authorization.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1) Who is calling? (verify the session JWT)
  const { data: u, error: uErr } = await admin.auth.getUser(jwt)
  if (uErr || !u.user) return json({ error: 'Invalid session.' }, 401)

  // 2) Caller must be admin or owner.
  const { data: caller } = await admin
    .from('customers').select('is_admin, is_owner').eq('user_id', u.user.id).maybeSingle()
  if (!caller || !(caller.is_admin || caller.is_owner)) return json({ error: 'Admin access required.' }, 403)

  // 3) Resolve the target customer.
  let body: { customer_id?: string; redirect_to?: string }
  try { body = await req.json() } catch { return json({ error: 'Bad request body.' }, 400) }
  if (!body.customer_id) return json({ error: 'customer_id is required.' }, 400)

  const { data: target } = await admin
    .from('customers').select('email, is_owner').eq('id', body.customer_id).maybeSingle()
  if (!target?.email) return json({ error: 'Customer not found or has no email on file.' }, 404)
  // The owner failsafe is reset only through its own secure channel.
  if (target.is_owner) return json({ error: 'The owner account can’t be reset from here.' }, 403)

  // 4) Mint the recovery (set-password) link. No email is sent.
  const redirectTo = body.redirect_to || `${url}/reset-password`
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo },
  })
  if (lErr) return json({ error: lErr.message }, 400)

  const actionLink = (link as { properties?: { action_link?: string } })?.properties?.action_link ?? null
  if (!actionLink) return json({ error: 'Could not generate the link.' }, 500)
  return json({ link: actionLink, email: target.email })
})
