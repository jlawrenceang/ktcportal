# KTC Online Portal — Admin Guide

Para sa KTC admin staff at sa owner. Sakop nito ang buong back office: pag-verify ng mga customer, pag-process ng job orders, mga payment at invoice, pag-file para sa iba, configuration, at ang security model. (May sariling mas maiikling guide ang cashier at checker stations.)

---

## 1 · Dashboard

Ipinapakita ng landing page ang live na bilang — pending approvals, ang open job-order queue, mga customer — at bawat tile ay naka-link sa page nito. Ang staff accounts ay hindi binibilang bilang customer.

## 2 · Pag-verify ng mga customer (Approvals)

- Bawat card ay nagpapakita ng detalye ng registrant kasama ang mga badge: **✓ Email confirmed · ✓ Valid ID on file · ✓ Terms & DPA accepted**.
- **View / Download** ang na-upload na ID (signed link). **Naka-disable ang Approve hangga't walang ID na naka-file.**
- **Approve** → ma-e-email ang customer, at anumang job orders na in-file nila habang naghihintay ay ilalabas sa queue kasama ang totoong JO numbers.
- May dalawang path ang **Reject**: *recoverable* (hindi mabasa ang ID / kailangan ng updated info — makikita ng customer ang isang magaan na "resubmit your details" panel at puwedeng ayusin + i-re-upload) o **Suspend** (terminal; ang kanilang held orders ay kinakansela).
- Ang unverified accounts na nag-confirm ng email pero walang na-upload na ID sa loob ng **48 hours** ay auto-rejected (hourly job).

### ID retention

Ang mga na-upload na ID ay itinatago nang guaranteed na **24 hours** (review window — naka-block ang deletion), puwedeng i-delete nang manual mula sa file viewer (🗑) sa pagitan ng 24 hours at 3 days, at **auto-purged sa 3 days**. Ang pag-approve ay hindi agad nagde-delete ng file.

## 3 · Pag-process ng job orders

Ipinapakita ng **Job Orders** queue ang live na orders (hindi kasama ang held drafts mula sa unverified accounts).

- **Per-service completion:** lagyan ng tsek na ✓ ang bawat service line kapag tapos na. Ang unang ✓ ay naglilipat ng order sa *processing*; nako-complete lang ito kapag **lahat** ng lines ay tapos na.
- **Hold for info** (may note): nakikita ng customer ang note, sumasagot at nag-re-resubmit sa loob ng app — **napapanatili ang kanilang serving number**. Ipinapakita sa card ang kanilang sagot.
- **Reject** (may note): ang recoverable rejections ay nagpapahintulot sa customer na ayusin at i-refile — babalik sila sa **dulo ng pila**; ang **↩ Restore #N** ay nagbabalik ng orihinal na number kapag may basehan.
- **🕘 History** sa bawat card: filed / status changes / service-done events kasama ang pangalan ng actor at timestamps.
- Ang **Serving numbers** ay per service line, nire-reset kada linggo (Monday 00:15 carry-over na nag-re-requeue ng open orders sa harap, ayon sa pagkakasunod). Ang cancel/reject ay nagbabakante ng number (sinunog, hindi muling ginagamit).

## 4 · Mga payment at invoice

- **Payment proofs:** ang orders na may na-upload na deposit slip ay nagpapakita ng "Payment proof to review". Buksan ang slip (may Print / Save ang viewer), tapos **Confirm** o **Reject with a note** — ma-e-email ang customer alinman ang mangyari at puwede silang mag-re-upload.
- **Pag-record ng Service Invoice** (galing sa ERP, kapag bayad na lang): ilagay ang **parehong** numero — ang control no. (OR-INV-… / BI-INV-…) at ang **printed pad serial** (panatilihin ang leading zeros). OR = **PAID**, BI = **BILLED** (credit). Pareho silang vina-validate, sine-save nang atomic, at lino-log.
- **Unpaid · completed** view: ang completed orders na walang invoice, may aging chips (*unpaid 3d*).
- Ang **🗄 Archive paid & completed** (o ang Monday cron) ay naglilipat ng tapos na, may-invoice na orders palabas ng default views; hindi naaapektuhan ang customer history.

## 5 · Pag-file para sa iba (New JO)

Para sa walk-ins: ang **New JO** ay nagfa-file ng job order para sa kahit sinong customer — diretso itong napupunta sa submitted na may serving number, ang success panel ay nag-aalok ng printable slip, at nire-record ng History ikaw bilang ang nag-file.

## 6 · Customers & consignees

- **Customers:** ang master list (search, status, badges). I-click ang pangalan para sa profile — detalye, verification badges, at buong job-order history.
- **Consignees:** ang master list na ginagamit ng typeahead ng JO form (puwedeng pumili ang kahit sinong customer ng kahit anong consignee — current policy).

## 7 · Settings

- **Service rates & fees:** naka-lock by default — i-tap ang "🔒 Locked — unlock to edit". Per-service rates (₱, per container, VATable flag), flat na admin at print fees. **Naka-fixed ang VAT sa statutory na 12%** (server-guarded). I-drag ang rows (⠿) para itakda ang display order kahit saan. Ang pag-save ay muling nagla-lock.
- **Service catalogue:** magdagdag ng service (name + VATable — permanente ang mga name, i-deactivate sa halip na i-rename), i-toggle ang active/inactive (inactive = nakatago sa mga bagong filing; pinapanatili ng existing orders ang kanilang label at pricing), ✕ delete lang kapag hindi pa kailanman nagamit.
- **Payment details:** bank name / account / GCash at ang QR image na ipinapakita sa customer payment page. Ang mga blangkong field ay nakatago.
- **Staff accounts:** gumawa ng cashier / checker logins (username + password, walang email), mag-reset ng passwords, at i-edit ang **role-gate matrix** — kung ano ang puwedeng makita at gawin ng bawat role. Ang gates ay ipinatutupad server-side.

## 8 · Logs & system health

- **Logs:** apat na view — Job orders (buong audit trail), **Security** (owner-only: mga blocked na escalation attempts, role-gate changes, session evictions), Client errors, Emails & sync (bawat outbound call kasama ang HTTP result nito).
- **Settings → System health:** one-click snapshot ng huling run ng bawat scheduled job, mga outbound failure, at mga recent na client error.
- May **watchdog** na tumatakbo kada 15 minutes at nag-e-email sa owner kapag may totoong problema (failed jobs, failed sends, error spikes, escalation attempts).

## 9 · Security model (kung ano ang nagpoprotekta sa portal)

- **Sign-in:** CAPTCHA enforced server-side; kailangan ng email confirmation; 5 maling password = 60s lockout.
- **2FA (admin + owner):** mag-enroll ng authenticator app sa **2FA** tab. Kapag naka-enroll na, hindi gumagana ang admin rights hangga't hindi naipapasok ang 6-digit code — kahit para sa direktang API calls.
- **Sessions:** ang staff ay nagti-time out pagkatapos ng **60 idle minutes** ("still there?" prompt isang minuto bago mag-out). **Isang active session per account** — ang bagong login ay nag-e-evict ng luma kahit saan, agad-agad (lumalabas ang evictions sa Logs → Security).
- **Tamper protection:** anumang ginawang pagtatangka na mag-self-grant ng admin/owner/status flips ay binabawi, **auto-suspends** ang account, pinapatay ang sessions nito, at inaalertuhan ang owner.
- **Owner failsafe:** ang owner account ay server-only, hindi puwedeng ma-lock out o ma-demote, at siya lang ang puwedeng gumawa ng staff o magbago ng role gates.

---

*Ang guide na ito ay sumasalamin sa portal ayon sa pagkakabuo nito — kapag may duda, ang in-app na behavior ang siyang authoritative. Magmungkahi ng mga pagwawasto sa owner.*
