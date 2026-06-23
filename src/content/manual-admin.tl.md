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
- **Cancellation cascades:** ang **pag-suspend o pag-reject ng customer** ay nagkakansela ng lahat ng kanilang open job orders — **maliban** sa mga order na bayad na o may naka-record nang ERP service invoice, na iniiwang nakalagay para sa manual handling. (Ang pag-reject ng **consignee** ay parehong nagkakansela ng open job orders nito — tingnan ang Consignees sa ibaba.)

### ID retention

Ang mga na-upload na ID ay itinatago nang guaranteed na **24 hours** (review window — naka-block ang deletion), puwedeng i-delete nang manual mula sa file viewer (Delete) sa pagitan ng 24 hours at 3 days, at **auto-purged sa 3 days**. Ang pag-approve ay hindi agad nagde-delete ng file.

## 3 · Pag-process ng job orders

Ipinapakita ng **Job Orders** queue ang live na orders (hindi kasama ang held drafts mula sa unverified accounts).

- **Cards / List toggle:** mag-switch sa pagitan ng **Cards** (detalyado, maraming action) at compact na **List** view; tinatandaan ang pinili mo. Sa Cards view, ang maraming per-order action ay nakatago sa **⋯ Actions** menu.
- **Per-service completion:** lagyan ng tsek na ✓ ang bawat service line kapag tapos na. Ang unang ✓ ay naglilipat ng order sa *processing*; nako-complete lang ito kapag **lahat** ng lines ay tapos na.
- **Hold for info** (field-targeted): i-tsek kung aling mga field ang kailangang i-re-enter ng customer — **Consignee · Entry number · Vessel & Voyage · Containers** — at maglagay ng note. Ang mga na-tsek na field lang ang mabubuksan para sa customer; naka-lock pa rin ang lahat ng iba. Ipinapakita sa card ang kanilang sagot.
- **Final ang Reject:** ang pag-reject ng job order ay terminal — **hindi** na ito puwedeng i-resubmit ng customer (mag-fa-file sila ng bago). Gamitin ang **Hold for info** para sa anumang puwedeng ayusin.
- **Iisang payment pill:** ang bawat card ay nagpapakita ng iisang **"Balance to pay" / "Paid"** indicator na sakop ang base + RPS + bawat additional charge (walang hiwalay na payment chips). Nananatili ang "payment proof to review" cue at ang ERP service-invoice chip.
- **Additional charges:** kapag magdadagdag ng charge, pumili mula sa mga seeded na **charge types** (mina-manage sa **Settings → Additional charge types**) — pre-filled ang amount pero puwede pa ring i-edit — o piliin ang **"Other…"** para sa one-off.
- **History** sa bawat card: filed / status changes / service-done events kasama ang pangalan ng actor at timestamps.
- Ang **Serving numbers** ay per service line, nire-reset kada linggo (Monday 00:15 carry-over na nag-re-requeue ng open orders sa harap, ayon sa pagkakasunod). Ang cancel/reject ay nagbabakante ng number (sinunog, hindi muling ginagamit).

## 4 · Mga payment at invoice

- **Payment proofs:** ang orders na may na-upload na deposit slip ay nagpapakita ng "Payment proof to review". Buksan ang slip (may Print / Save ang viewer), tapos **Confirm** o **Reject with a note** — ma-e-email ang customer alinman ang mangyari at puwede silang mag-re-upload.
- **Pag-record ng Service Invoice** (galing sa ERP, kapag bayad na lang): ilagay ang **parehong** numero — ang control no. (OR-INV-… / BI-INV-…) at ang **printed pad serial** (panatilihin ang leading zeros). OR = **PAID**, BI = **BILLED** (credit). Pareho silang vina-validate, sine-save nang atomic, at lino-log.
- **Unpaid · completed** view: ang completed orders na walang invoice, may aging chips (*unpaid 3d*).
- Ang **Archive paid & completed** (o ang Monday cron) ay naglilipat ng tapos na, may-invoice na orders palabas ng default views; hindi naaapektuhan ang customer history.

## 5 · Pag-file para sa iba (New JO)

Para sa walk-ins: ang **New JO** ay nagfa-file ng job order para sa kahit sinong customer — diretso itong napupunta sa submitted na may serving number, ang success panel ay nag-aalok ng printable slip, at nire-record ng History ikaw bilang ang nag-file.

## 6 · Customers & consignees

- **Customers:** ang master list (search, status, badges). I-click ang pangalan para sa profile — detalye, verification badges, at buong job-order history.
- **Consignees:** ang master list na ginagamit ng typeahead ng JO form (puwedeng pumili ang kahit sinong customer ng kahit anong consignee — current policy). Ang **pag-reject ng consignee** ay nagkakansela ng open job orders nito, na may dahilan na ipinapakita sa mga apektadong customer.

## 7 · Settings

- **Service rates & fees:** naka-lock by default — i-tap ang "Locked — unlock to edit". Per-service rates (₱, per container, VATable flag) kasama ang iisang flat na **Admin & print fee** (pinagsama na ang dating hiwalay na admin fee at print fee). **Naka-fixed ang VAT sa statutory na 12%** (server-guarded). I-drag ang rows (⠿) para itakda ang display order kahit saan. Ang pag-save ay muling nagla-lock.
- **Terminal tariff (per-service):** para sa bawat service, i-tsek kung aling mga kondisyon nag-iiba ang rate nito — **origin / size / fill / kind**, o wala para sa **uniform** na rate. Ipapakita lang ng editor ang mga input na tina-tsek mo, kaya ang uniform na service ay iisang cell lang habang ang fully-varied na service ay lumalawak sa matrix nito.
- **Storage:** hiwalay na ini-edit. **Domestic** = flat per-day rate ayon sa size. **Foreign** = progressive per-day **bands** (Import / Export / Transhipment × size); ang mga band ay siningil **cumulatively** kapag naubos na ang free days ng line.
- **Trade terminology:** ang **foreign** na cargo ay **Import / Export / Transhipment**; ang **domestic** ay **Inbound / Outbound** — ipinapakita sa buong app na may colour-coded na Foreign / Domestic pill.
- **Service catalogue:** magdagdag ng service (name + VATable — permanente ang mga name, i-deactivate sa halip na i-rename), i-toggle ang active/inactive (inactive = nakatago sa mga bagong filing; pinapanatili ng existing orders ang kanilang label at pricing), ✕ delete lang kapag hindi pa kailanman nagamit.
- **Additional charge types:** ang seeded na listahan na pinagpipilian ng cashier/admin kapag magdadagdag ng charge sa isang order (bawat isa ay may default na amount na pre-filled pero puwede pa ring i-edit). Ang "Other…" sa mismong order ay laging nagpapahintulot ng one-off na charge.
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
