# Lara Chatbot Map

Current source of truth: `src/components/chat/nodes.ts`.

This map is for review/editing of the authored paths only. Lara remains deterministic: no LLM, no hidden generation, and support-ticket writes still go through `open_ticket`.

```mermaid
flowchart TD
  root[Main menu]
  root --> orders[Orders]
  root --> vessel[Vessel schedule]
  root --> pay[Rates & payment]
  root --> release[Container release / pull-out]
  root --> account[Account & verification]
  root --> feedback[Feedback & concerns]
  root --> talk[Talk to a person]

  orders --> fileHow[File a new order]
  fileHow --> fileLaraEntry[File with Lara: Entry Number]
  fileLaraEntry --> fileLaraVessel[Vessel / voyage hint]
  fileLaraVessel --> saveDraft[Save local draft]
  saveDraft --> newJO[Open New Job Order]

  fileHow --> newJO
  fileHow --> requirements[Requirements]
  fileHow --> services[Services]
  fileHow --> pending[Pending account limits]

  orders --> track[Track an order]
  track --> trackRun[Lookup JO number]
  orders --> listOrders[List recent orders]

  vessel --> viewVessels[Open Vessel Schedule]
  vessel --> findVessel[Find vessel]
  vessel --> missingVessel[Missing vessel]
  missingVessel --> vesselTicket[Operations ticket]

  pay --> calculator[Open Rate Calculator]
  pay --> paymentHow[How to pay]
  pay --> paymentDetails[Bank / GCash / QRPH]

  account --> verifyId[Open Verify ID]
  account --> accountSettings[Open My Account]
  account --> accountTicket[Account ticket]

  feedback --> feedbackTicket[Tagged support ticket]
  talk --> ticket[Support ticket]
```

## Filing Guardrail

Lara does not submit job orders directly. The safe handoff is:

1. Capture entry number and vessel/voyage hint.
2. Save a local draft in `sessionStorage`.
3. Open `/job-order?laraDraft=1`.
4. The real form handles consignee selection, vessel matching, supporting image upload, containers, review, and final submit.
