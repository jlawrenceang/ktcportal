# KTC Online Portal — Gabay sa Cashier

Ang station mo ay ang **Job Orders** queue — dito ka mismo dadalhin pagka-sign in. Dalawa ang trabaho mo: i-review ang mga online payment proof, at i-record ang mga Service Invoice number. (Kung anong mga button ang makikita mo ay naka-set ng owner sa pamamagitan ng role gates; ang gabay na ito ay para sa standard na cashier setup.)

---

## 1 · Pag-sign in

- Gamitin ang iyong **username** at password sa portal login page (hindi kailangan ng email).
- Kung may naka-enroll na 2FA ang account mo, maglalagay ka rin ng 6-digit na code mula sa authenticator app.

## 2 · Pag-review ng payment proofs

Pwedeng magbayad ang mga customer sa pamamagitan ng bank transfer o GCash at mag-upload ng deposit slip. Ang mga order na naghihintay sa iyo ay may nakalagay na **"Payment proof to review."**

- Buksan ang slip — pwede itong **Print** o **Save** sa viewer para sa filing.
- I-check ang amount laban sa mga charges ng order (nakalagay sa parehong card).
- **Confirm** kung tama ito. **Reject with a short note** (maling amount, malabong photo…) kung hindi — ipapadala sa customer ang note mo sa email at pwede silang mag-upload ulit.
- Ang isang na-confirm na online payment ay susunod pa rin sa normal na cashiering process ng KTC para sa official paperwork.

## 3 · Pag-record ng Service Invoice

Ang official Service Invoice ay galing sa ERP ng KTC, kapag bayad na lang. Sa completed na order, i-record ang **parehong** number:

- ang **control number** — OR-INV-… (cash) o BI-INV-… (billed/credit), at
- ang **printed pad serial** — ang number sa physical pad, halimbawa 001323 (panatilihin ang mga leading zero).

Parehong validated ang mga ito (tatanggihan ang basura na may hint) at sabay na sine-save. Pagkatapos, lalabas sa order ang **PAID** (OR) o **BILLED** (BI), at makikita ng customer ang printed number sa kanilang order.

### Unpaid · completed

Ipinapakita ng view na ito ang mga completed order na wala pa ring invoice, kasama ang mga aging chip (*unpaid 3d*). Pag na-record na ang invoice, maaalis ang order sa view.

## 4 · Housekeeping

- **Archive paid & completed** — nililinis nito ang mga tapos na, na-invoice na order palabas ng default views (tumatakbo rin ito nang automatic tuwing Lunes). Hindi ito nakakaapekto sa history ng customer.

## 5 · Ang session mo

- Ang station ay **nagsa-sign out pagkatapos ng 60 idle minutes**. May lalabas na "Are you still there?" na prompt isang minuto bago iyon — isang tap lang para manatiling buhay.
- **Isang active session kada account:** kung gagamitin ang parehong login sa ibang device, masa-sign out ang station na ito na may notice. Kung mangyari ito nang hindi inaasahan, sabihin sa admin.
- Huwag kailanman i-share ang password mo; pwedeng i-reset ito ng admin kahit kailan mula sa Settings.

---

*Anumang mukhang mali sa mismong order (status, services, holds) ay hinahawakan ng admin — i-flag ito sa halip na umiwas o gumawa ng workaround.*
