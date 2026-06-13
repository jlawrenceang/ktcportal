# Form spec — KTC Job Order Form

Fields modeled on the competitor (DICT) "Job Order Form — X-Ray, DEA and OOG
Stripping service orders". We copy the **field structure**, not the styling.

**Form title:** KTC Job Order Form
**Subtitle:** For X-ray related service orders
**Jotform form ID:** `261546852224458`
**Build / edit:** https://www.jotform.com/build/261546852224458
**Live form:** https://form.jotform.com/261546852224458
**Account:** jlawrenceang (US region, Free plan)

## Fields the user fills in

| # | Label | Field key | Jotform type | Required | Notes / options |
|---|---|---|---|---|---|
| 1 | Customer ID | `customer_id` | Short text | No | Competitor has search→autofill (see Backlog) |
| 2 | Customer Name | `customer_name` | Short text | Yes | |
| 3 | Email | `email` | Email | Yes | allows multiple, comma-separated |
| 4 | Contact Number | `contact_number` | Phone | No | mask `0000-000-0000` |
| 5 | Entry Number | `entry_number` | Short text | Yes | e.g. `C-0000012345` |
| 6 | Container Details | `container_details` | Repeating list | Yes | rows of Container Number + Service Request |
| 6a | └ Container Number | `container_number` | Short text | — | e.g. `ABCD1234567` |
| 6b | └ Service Request | `service_request` | Dropdown | — | options below |

**Service Request options:**
`X-ray` · `DEA ONLY` · `X-ray + DEA` · `X-ray + DEA (For PDEA)` · `DEA ONLY (For PDEA)` · `OOG Stripping`

## Auto-generated (not user-filled)

- **Job Order ID** — `X-#####` (competitor auto-increments)
- **Submission Date**
- Formatted **PDF** + **confirmation email** containing the container table

## Backlog — advanced features (not in v1)

1. **Customer ID search + autofill.** Competitor maps a Customer ID to company name/email
   (e.g. `1161 = MCR AGRI-VENTURE`, `3198 = KTC CONTAINER TERMINAL`). Needs a customer
   data source + prefill logic. Defer until the customer list is digitized.
2. **Auto Job Order ID** — add an auto-increment field with `X-` prefix.
3. **PDF / email template** styled to KTC branding.
