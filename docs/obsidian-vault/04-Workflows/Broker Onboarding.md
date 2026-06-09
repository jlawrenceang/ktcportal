---
title: Broker Onboarding
tags: [workflow, brokers]
type: workflow
---

# 🔄 Broker Onboarding

End-to-end chain from a broker registering to being able to submit job orders.

## Steps (email-confirmation flow, 2026-06-09)

1. **Register** (`/login` register tab) — broker enters full name + email + password, scrolls/accepts the two consents, passes CAPTCHA. `signUp()` creates the Supabase auth user (consents recorded in auth metadata) and the `handle_new_user` trigger creates a `brokers` row `status = pending`. **No valid ID at this step.** Email is the broker's login identifier (no separate username).
2. **Confirm email** — Supabase sends a confirmation email via Resend (`noreply@ktcterminal.com`, template `docs/email-templates/confirm-signup.html`). The link returns the broker to the app (`emailRedirectTo`), now authenticated.
3. **Complete application** — on first login the pending panel (`src/components/PendingPanel.tsx`) prompts the broker to **upload their valid ID** (now there's a session, so the per-user `valid-ids` storage policy applies) and syncs the consent columns onto the broker row.
4. **Admin review** — staff open `/admin/approvals` (or `/admin/brokers`), see the consent/ID badges, view the valid ID (signed URL), and approve → `status = approved` (or reject-with-reason / suspend).
5. **Access granted** — broker reaches Home, New Job Order, My Job Orders, Agreement.

> Why ID-after-confirmation: the `valid-ids` policy requires `auth.uid()` (a session); with email-confirmation ON there's no session at sign-up, so uploading post-confirmation keeps the strong per-user storage security with no anonymous-upload hole.

## Invariants

- Un-approved brokers cannot transact (gate in `Shell.tsx`).
- Owner/admins bypass the broker surface entirely (`RoleLanding` → `/admin`).
- `useBroker` filters by `user_id` so an admin viewing all rows still resolves their own broker row.

## Related

- [[Brokers]] · [[Authentication]] · [[Administration]]
- Next: [[Consignee Accreditation]], [[Job Order Submission]]
