# KTC Online Portal — Operations Guide

May dalawang station kang hinahawakan: ang **X-ray Checker** (ito ang home mo pag nag-sign in) at ang **Vessels** (ang vessel schedule). Tatlo ang trabaho: **i-assess** ang bawat Job Order para sa X-ray / port-services, **i-confirm** na tapos na ang X-ray, at panatilihing updated ang **vessel schedule**.

---

## 1 · Signing in

- Gamitin ang iyong **username** at password sa login page (hindi kailangan ng email).
- Mapupunta ka sa **X-ray Checker** queue — mga order na naghihintay ng X-ray, naka-sort ayon sa line number, na may **Now serving** strip sa itaas.
- Ang mga nav tab mo: **X-ray Checker**, **Vessels**, **Job Orders** (read-only), **Manual**.

## 2 · Assess a job order (RPS)

Awtomatikong naka-queue ang bawat order. Sa bawat card, i-tap ang **Assess RPS**:

- Para sa plain X-ray lang, i-tap ang **No RPS needed**.
- Kung may kailangang **port-services moves** (DEA / inspection — pagbubukas ng van: lift on, trucking, shifting, stripping, stuffing), basahin ang **number of moves per type** mula sa **RPS**, i-enter ito, opsyonal na **i-upload ang RPS document**, tapos **Save — needs RPS**.
- Ang mga move na iyon ay siningil **per move** (ang rates ay set ng admin) at idinadagdag sa total ng customer bukod pa sa base X-ray charge. Karamihan ng order ay walang kailangang ganito.

## 3 · Confirm X-ray done

Pag pumasa sa X-ray ang container, i-tap ang **Confirm**:

- Permanenteng nakatatak ang petsa at oras.
- Aalis sa queue mo ang order; matatapos ito kapag tapos na lahat ng services nito.
- **Look up** ang kahit anong container o JO number para masagot ang "cleared na ba 'tong box na 'to?" — **CLEARED** (may oras) o **NOT CLEARED · X-ray pending**.

## 4 · Update the vessel schedule (Vessels tab)

Makakapag-file lang ang mga customer ng Job Order kontra sa isang **current** na vessel/voyage, kaya ang pagpapanatiling updated nito ang nagbibigay-daan para makapag-file sila.

- **Add a call:** vessel visit (hal. `26RUH02`), vessel name, voyage, shipping line, actual arrival, finish discharging, berth. Ang **Last Free Day ay kusang nako-compute** (finish discharging + ang free-days ng line na iyon, na set ng admin) — at awtomatikong **maaalis ang call** kapag lumipas na ang last free day nito. Walang manu-manong pagsasara.
- **Bulk update:** i-tap ang **⬇ Template**, punan ang sheet (o i-paste mula sa sarili mo), tapos **⬆ Import** — magda-dagdag/mag-uupdate ito ayon sa **vessel visit**, kaya ligtas na i-re-import ang parehong sheet (walang mado-doble).
- **Calendar** view ang nagpapakita ng mga arrival kada buwan.
- **📸 Snapshot** ay gumagawa ng malinis na imahe ng **active vessels** — sa phone, diretsong nai-share sa iyong **Viber group**; sa computer, nada-download ito para ma-attach mo.
- Kung wala pa sa listahan ang vessel ng customer, mag-file sila gamit ang **"not listed"** at i-type ito — i-add mo lang ang call at maa-align ito.

## 5 · What's not yours

Ang pag-process ng Job Order, holds, rejects, payments at invoices ay para sa **admin** at **cashier** — i-flag mo na lang ang mga 'yon kaysa magkumahog ka para lusutan.

## 6 · Your session

- Magsi-sign out pagkatapos ng **60 idle minutes** — may lalabas na "Are you still there?" prompt isang minuto bago mag-sign out; isang tap lang at tuloy-tuloy pa.
- **Isang active session kada account** — kapag nag-sign in ka sa ibang lugar, masa-sign out itong kasalukuyan.
- Wag i-share ang password mo; kaya itong i-reset ng admin kahit kailan.

---

*I-replay ang quick tour ng guide na ito gamit ang ✨ button sa nav.*
