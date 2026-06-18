// Admin-only: mint a one-time "set new password" link for a customer, for the
// admin to hand over directly (Viber/SMS/phone) when the customer can't use the
// self-service email reset — and as a spam-proof fallback (no email is sent
// from here). The link is single-use and expires per Auth's OTP expiry
// (default ~1h).
//
// Security: owner/admin ONLY, and never the owner failsafe account. The gateway
// requires a valid session (default verify_jwt); we additionally confirm the
// caller is admin/owner by calling public.is_admin() AS THE CALLER (anon key +
// the caller's JWT) so the DB's MFA(aal2) + live-session checks apply — a stolen
// password at aal1 cannot mint reset links. Mirrors the boc-mirror conventions.
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !serviceKey || !anonKey) return json({ error: 'Function not configured.' }, 500)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Missing authorization.' }, 401)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1) Who is calling? (verify the session JWT)
  const { data: u, error: uErr } = await admin.auth.getUser(jwt)
  if (uErr || !u.user) return json({ error: 'Invalid session.' }, 401)

  // 2) Caller must be admin/owner — evaluated by the DB AS THE CALLER, so
  //    is_admin() folds in MFA(aal2) + session-alive. is_admin() already returns
  //    true for the owner (is_admin OR is_owner). A password-only (aal1) session
  //    of an MFA-enrolled admin therefore fails here, closing the bypass.
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: isAdmin, error: permErr } = await callerClient.rpc('is_admin')
  if (permErr) return json({ error: 'Authorization check failed.' }, 500)
  if (isAdmin !== true) return json({ error: 'Admin access required (complete MFA verification if enabled).' }, 403)

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
  //    Allowlist redirect_to to the portal origin (defense-in-depth over Auth's
  //    own Redirect-URL allowlist) so the action link can't be aimed elsewhere.
  const safeRedirect = (input?: string): string => {
    const fallback = `${url}/reset-password`
    if (!input) return fallback
    try {
      const r = new URL(input)
      if (r.protocol === 'https:' &&
          (r.hostname === 'ktcterminal.com' || r.hostname.endsWith('.ktcterminal.com'))) {
        return input
      }
    } catch { /* not an absolute URL */ }
    return fallback
  }
  const redirectTo = safeRedirect(body.redirect_to)
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
