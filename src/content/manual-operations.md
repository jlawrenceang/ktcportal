# KTC Online Portal — Operations Guide

You run two stations: the **X-ray Checker** (your sign-in home) and **Vessels** (the vessel schedule). Three jobs: **assess** each job order for X-ray / port-services, **confirm** the X-ray is done, and keep the **vessel schedule** current.

---

## 1 · Signing in

- Use your **username** and password on the login page (no email needed).
- You land on your **Job Orders** work surface — the live order queue in a focused app shell.
- Your X-ray work (assess + confirm) is on the **X-ray Checker**: open it from **Open full portal → X-ray Checker**. The Checker shows the queue in **line order — the priority lane first** — with the **Now serving** strip on top. (The focused checker app handles confirm-only.)

## 2 · Assess a job order (RPS)

Every order is queued automatically. On each card, tap **Assess RPS**:

- For a plain X-ray, tap **No RPS needed**.
- If it needs **port-services moves** (DEA / inspection — opening the van: lift on, trucking, shifting, stripping, stuffing), read the **number of moves per type** off the **RPS**, enter them, optionally **upload the RPS document**, then **Save — needs RPS**.
- Those moves are charged **per move** (rates set by admin) and added to the customer's total on top of the base X-ray charge. Most orders need none.

## 3 · Confirm X-ray done

When a container passes the X-ray, hit **Confirm**:

- The date and time are stamped permanently.
- The order leaves your queue; it completes once all its services are done.
- **Look up** any container or JO number to answer "is this box cleared?" — **CLEARED** (with time) or **NOT CLEARED · X-ray pending**.

## 4 · Update the vessel schedule (Vessels tab)

Customers can only file a job order against a **current** vessel/voyage, so keeping this current is what lets them file.

- **Add a call:** vessel visit (e.g. `26RUH02`), vessel name, voyage, shipping line, actual arrival, finish discharging, berth. The **Last Free Day computes itself** (finish discharging + that line's free-days, which admin sets) — and a call **drops off automatically** once its last free day passes. No manual closing.
- **Bulk update:** tap **Sync from Google Sheet** to pull the latest calls from the connected schedule sheet — it adds/updates by **vessel visit**, so a sync updates rather than duplicates.
- **Calendar** view shows arrivals by month.
- If a customer's vessel isn't listed yet, they **can't file against it** — add the call to the schedule first, then they (or you, on their behalf) can file under it.

## 5 · The Job Orders tab

Your **Job Orders** tab is read-only by default — a **Cards / List** toggle (your choice is remembered) lets you browse the queue; in Cards view per-order actions sit behind a **⋯ Actions** menu. Each card shows a single **"Balance to pay" / "Paid"** pill (base + RPS + every additional charge), plus a "payment proof to review" cue and the ERP service-invoice chip.

If the owner grants you the hold/reject gates, the same rules as admin apply:

- **Hold for info** is field-targeted — tick which fields the customer must re-enter (**Consignee · Entry number · Vessel & Voyage · Containers**) and add a note; only those fields unlock for them.
- **Reject is final** — a rejected order cannot be resubmitted (the customer files a new one). Use **Hold for info** for fixable issues.
- **Priority lane:** **Request priority** on an order to move it ahead of the X-ray line (an admin approves it). Approved orders get a **P-…** number and are served first.
- **Re-X-ray:** on a **completed** order, **Request re-X-ray** (an admin approves) — it creates a suffixed child order (e.g. `JO-000001A`) for a fresh X-ray.

## 6 · What's not yours

Processing job orders, payments and invoices otherwise belong to **admin** and **cashier** — flag those rather than working around them.

## 7 · Your session

- Signs out after **60 idle minutes** — an "Are you still there?" prompt appears a minute before; one tap keeps it alive.
- **One active session per account** — signing in elsewhere signs this one out.
- Never share your password; the admin can reset it anytime.

---

*Replay this guide's quick tour with the Quick tour button in the nav.*
