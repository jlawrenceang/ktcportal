# Go-live TODO — pre-launch checklist

Owner-actioned items that must be settled before the public launch / staff dry-run.
Engineering work is shipped; what remains here is configuration, legal, and security
that only the owner can complete. Keep this current — tick items as they're done.

## 1. Legal / Data Privacy Act (RA 10173) — **deferred, must do around launch**
- [ ] **Appoint a Data Protection Officer (DPO).** Can be an internal person. The
      Customer Agreement (v4) now *commits* to this rather than falsely claiming it.
      KTC processes the personal data of 1,000+ data subjects, so under the DPA this
      is a legal obligation, not optional.
- [ ] **Register with the National Privacy Commission (NPC).** Same basis. The
      agreement commits to "complete NPC registration as required by law."
- [ ] **Set up a dedicated privacy/DPO mailbox** (e.g. `dpo@ktcterminal.com`) and
      update the agreement contact. *Interim contact is `jla.ktcport@gmail.com`.*
- [ ] **Confirm the liability-cap floor** — currently **₱100,000** (Agreement §5).
      A counsel-confirm item.
- [ ] **Final PH-counsel pass on the Customer Agreement (v4).** The current text was
      AI-reviewed against PH frameworks (DPA, e-Commerce Act, Civil Code, fairness)
      and the three blockers fixed — but counsel review is the gold standard before
      public launch.

## 2. Security — **re-enable before the staff dry-run** (down for testing)
- [ ] **Re-enable Turnstile** (server-enforced Managed CAPTCHA). Also blocks bot
      signups, alongside the disposable-email block (live).
- [ ] **Re-enable MFA** and enroll the owner + staff (`/admin/security`).
- [ ] **Rotate the owner password** (`jlawrenceang@gmail.com`).

## 3. Google OAuth
- [ ] **Finish the Supabase URL config** (Site URL + redirect allow-list) and
      **test the flow** end-to-end (smoke: ST05 Lane M).
- [ ] **Set the app-name branding** ("KTC Online Portal") in the Google consent
      screen so the sign-in page doesn't show the raw `…supabase.co` domain.

## 4. Other
- [ ] **Document-verification guide** — owner supplies the content; wire it into
      Lara's waiting slot (currently a holding answer).
- [x] Seed the support contact (`support_contact`) — done.
- [ ] **Run ST05** (the go-live blind walkthrough) on the live site before launch.
