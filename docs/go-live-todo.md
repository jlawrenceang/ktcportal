# Go-live TODO — pre-launch checklist

Owner-actioned items that must be settled before the public launch / staff dry-run.
Engineering work is shipped; what remains here is configuration, legal, and security
that only the owner can complete. Keep this current — tick items as they're done.

## 1. Legal / Data Privacy Act (RA 10173) — **deferred, must do around launch**
- [x] **Designate a Data Protection Officer (DPO).** Owner (Jan Lawrence Ang) named
      as DPO in the Customer Agreement (v4), interim. *Revisit if KTC wants a
      dedicated DPO role later.*
- [ ] **Register with the National Privacy Commission (NPC).** Deferred — the NPC
      references were removed from the agreement for now, but for a controller of
      1,000+ data subjects this remains a real DPA obligation to complete later.
      **DPO for the registration: Jan Lawrence Ang · `dpo@ktcterminal.com`** (now live).
- [x] **DONE 2026-06-27 — branded email live** via ImprovMX forwarding (MX →
      `mx1/mx2.improvmx.com`, SPF set): `dpo@ktcterminal.com` (DPO / privacy),
      `support@ktcterminal.com` (support), `*@ktcterminal.com` catch-all → forward to
      the owner's inbox. Wired into the agreement (DPO contact) + `support_contact`
      (support email). *Roast's "professionalism gap" closed.*
- [ ] **Confirm the liability-cap floor** — currently **₱100,000** (Agreement §5).
      A counsel-confirm item.
- [ ] **Final PH-counsel pass on the Customer Agreement (v4).** The current text was
      AI-reviewed against PH frameworks (DPA, e-Commerce Act, Civil Code, fairness)
      and the three blockers fixed — but counsel review is the gold standard before
      public launch.

## 2. Security — **re-enable before the staff dry-run** (down for testing)
- [x] **Turnstile re-enabled + server-enforcement verified 2026-06-26** — a no-token
      login is rejected `captcha_failed`; site key (`0x4AAAAAA…`) live in Vercel
      Production. *Final check pending: do one real login on the live site to confirm
      the Supabase secret pairs with the Vercel site key (same Cloudflare widget).*
- [ ] **Re-enable MFA** and enroll the owner + staff (`/admin/security`).
- [ ] **Rotate the owner password** (`jlawrenceang@gmail.com`).
- [ ] **MFA recovery / break-glass (audit T2-01, deferred here 2026-06-29).** Build
      with the MFA re-enablement so it's testable end-to-end: recovery codes at
      enrolment, an owner-only "clear a staff 2FA factor" action, and a documented
      owner break-glass (lost authenticator) path. Touches the owner failsafe →
      write a short spec + Jarvis review before building. (Phase-4 batch 4d.)

## 3. Google OAuth
- [x] **Finish the Supabase URL config** (Site URL + redirect allow-list) and
      **test the flow** end-to-end (covered by ST08).
- [x] **Set the app-name branding** ("KTC Online Portal") in the Google consent
      screen so the sign-in page doesn't show the raw `…supabase.co` domain.

## 4. Other
- [ ] **Document-verification guide** — owner supplies the content; wire it into
      Lara's waiting slot (currently a holding answer).
- [x] Seed the support contact (`support_contact`) — done.
- [ ] **Run ST08** (`docs/smoke-test-08-go-live.md`, the active/current go-live blind walkthrough) on the live site before launch. Start with the July 1 hardening rows for route/menu transitions, trusted MFA, email change, Lara, bulletin archive, tariff images, CIS print, request tracking, New JO filing, vessel calendar, 2FA recovery, and 30-minute customer idle behavior.
