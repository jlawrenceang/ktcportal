// send-sms — KTC SMS channel via android-sms-gateway (sms-gate.app).
//
// A dedicated Android phone + SIM running "SMS Gateway for Android" becomes an
// HTTP SMS sender (no per-SMS gateway fee — only the carrier rate). This function
// is the transport; the `notifications` AFTER INSERT trigger (sms_on_notification,
// migration 0193) fire-and-forgets a pg_net call here when a high-value customer
// notification is created — exactly mirroring the web-push path (0114).
//
// Required function secrets (scripts/setup-sms.mjs sets them):
//   SMS_SECRET        — shared trigger secret; the trigger sends it as x-sms-secret
//   SMS_GATEWAY_URL   — gateway base (default the free cloud relay api.sms-gate.app)
//   SMS_GATEWAY_USER  — gateway Basic-auth user (from the phone app)
//   SMS_GATEWAY_PASS  — gateway Basic-auth pass (from the phone app)
//
// Until SMS_GATEWAY_USER/PASS are set the function answers "not configured" — and
// the trigger itself is a silent no-op until the Vault sms_url/sms_secret exist,
// so this is safe to ship dormant (nothing sends until the gateway is connected).
//
// Graduating to a managed gateway (Semaphore / Twilio) later = change SMS_GATEWAY_*
// + the POST body shape below; the trigger + auth gate stay identical.

const GATEWAY = (Deno.env.get('SMS_GATEWAY_URL') ?? 'https://api.sms-gate.app').replace(/\/$/, '')
const USER = Deno.env.get('SMS_GATEWAY_USER') ?? ''
const PASS = Deno.env.get('SMS_GATEWAY_PASS') ?? ''
const SECRET = Deno.env.get('SMS_SECRET') ?? ''

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)
  // Auth gate — the trigger passes the shared secret; reject anything else so the
  // function can't be driven by a random caller (it sends real SMS / costs load).
  if (!SECRET || req.headers.get('x-sms-secret') !== SECRET) {
    return json({ ok: false, error: 'forbidden' }, 403)
  }
  if (!USER || !PASS) {
    return json({ ok: false, error: 'gateway not configured — set SMS_GATEWAY_USER / SMS_GATEWAY_PASS' })
  }
  try {
    const { to, message } = await req.json()
    const phoneNumbers = (Array.isArray(to) ? to : [to]).filter(Boolean)
    if (!phoneNumbers.length || !message) {
      return json({ ok: false, error: 'to + message required' }, 400)
    }
    const r = await fetch(`${GATEWAY}/3rdparty/v1/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(`${USER}:${PASS}`) },
      body: JSON.stringify({ message, phoneNumbers }),
    })
    return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500)
  }
})
