import { type TourStep } from '../components/Tour'
import {
  GridIcon, IdCardIcon, TagIcon, UsersIcon, BuildingIcon, BoxIcon, ScanIcon,
  SearchIcon, CheckCircleIcon, FlaskIcon, MoneyIcon, ReceiptIcon, CreditCardIcon,
  HashIcon, FlagIcon, ChatIcon, FolderIcon, MailIcon, EyeIcon, ShipIcon, CameraIcon,
} from '../components/icons'

// Per-page staff tours — each admin page calls usePageTour(key, steps). Steps
// spotlight elements on that page (no cross-page navigation). Role permissions
// already decide which pages a role can reach, so the page tours are generic.
const SZ = 26

export const dashboardSteps: TourStep[] = [
  {
    icon: <GridIcon size={SZ} />, title: 'Welcome to the KTC admin portal',
    body: 'The Dashboard is your live overview. Each tile is a live count that links straight to where the work happens — here\'s what they mean.',
  },
  {
    icon: <IdCardIcon size={SZ} />, title: 'Accounts awaiting approval', target: '[data-tour="dash-pendingAccounts"]',
    body: 'New customers who confirmed their email and need verifying. A ring/dot means work is waiting — tap to open Approvals, view their ID, and approve or reject.',
  },
  {
    icon: <TagIcon size={SZ} />, title: 'Consignees pending', target: '[data-tour="dash-pendingConsignees"]',
    body: 'Consignees added but not yet approved. Tap to review and approve them so they\'re selectable when customers file.',
  },
  {
    icon: <UsersIcon size={SZ} />, title: 'Customers', target: '[data-tour="dash-brokers"]',
    body: 'Your accredited customers. Tap to search, open a customer\'s detail, or suspend / reinstate an account.',
  },
  {
    icon: <BuildingIcon size={SZ} />, title: 'Consignees', target: '[data-tour="dash-consignees"]',
    body: 'The full consignee master list customers pick from. Tap to add, edit, or bulk-import.',
  },
  {
    icon: <BoxIcon size={SZ} />, title: 'Open job orders', target: '[data-tour="dash-jobOrders"]',
    body: 'The live queue — submitted, processing, and on-hold orders. Tap to open the working queue. Most of the day-to-day lives there: process orders, confirm payments, record invoices.',
  },
  {
    icon: <FlagIcon size={SZ} />, title: 'Needs your attention', target: '[data-tour="dash-queue"]',
    body: 'Below the tiles, the items actually waiting on you — accounts to approve, consignee requests — appear as a list you can tap straight into. When it\'s clear, you\'re all caught up.',
  },
]

export const checkerSteps: TourStep[] = [
  {
    icon: <ScanIcon size={SZ} />, title: 'X-ray Checker station',
    body: 'Your queue of orders waiting for X-ray, sorted by filing batch, oldest first, with each van\'s working-hours age shown. Each order lists its containers (vans) so you confirm them one by one.',
  },
  {
    icon: <SearchIcon size={SZ} />, title: 'Look up a container',
    body: 'Type a container/van or JO number to check a box: NOT CLEARED · X-ray pending means it\'s still waiting; CLEARED shows when it passed. Use it when a trucker or guard asks if a van can be released.',
  },
  {
    icon: <CheckCircleIcon size={SZ} />, title: 'Confirm each van',
    body: 'When a van enters the X-ray division for the BOC X-ray, tap ✓ Confirm X-ray on that van\'s row. A short prompt records your e-signature with the exact date and time. Confirm every van — once they\'re all done the order leaves your queue (and completes when its other services are finished).',
  },
  {
    icon: <FlaskIcon size={SZ} />, title: 'Assess RPS (operations)',
    body: 'If an order needs port-services moves (DEA / inspection), use Assess RPS on its card to record the moves — they bill per move on top of the base. Most orders need none.',
  },
]

export const cashierSteps: TourStep[] = [
  {
    icon: <MoneyIcon size={SZ} />, title: 'Welcome to the Cashier station',
    body: 'This is your money desk — one clean place for the three payment jobs, instead of digging through the shared queue. Use ↻ Refresh anytime to pull the latest.',
  },
  {
    icon: <ReceiptIcon size={SZ} />, title: 'Payments to review',
    body: 'Customers who paid online upload a deposit slip here. Tap View slip to open it, check the amount, then Confirm payment — or Reject with a short reason the customer will see. Confirming marks the order paid.',
  },
  {
    icon: <CreditCardIcon size={SZ} />, title: 'Collect at the window',
    body: 'Accepted orders that are still unpaid. When a customer pays in cash at your window, tap Record office payment to mark it PAID. If the order also needs RPS, there\'s a separate button to record that payment too.',
  },
  {
    icon: <HashIcon size={SZ} />, title: 'Record the ERP invoice',
    body: 'Once an order is completed, enter the Service Invoice number from the ERP (control number + pad/serial). Having an invoice number on file is what marks the order fully PAID in our records.',
  },
  {
    icon: <FlagIcon size={SZ} />, title: 'Two gates to complete',
    body: 'An order only finishes when BOTH gates are clear: payment is confirmed AND its X-ray is done. So confirming a payment here may auto-complete an order — or it may still be waiting on the checker. That\'s normal.',
  },
]

export const supportSteps: TourStep[] = [
  {
    icon: <ChatIcon size={SZ} />, title: 'Welcome to the Support inbox',
    body: 'Every customer support ticket lands here, newest activity first. This is where you help customers and keep their questions moving.',
  },
  {
    icon: <FolderIcon size={SZ} />, title: 'Filter by status',
    body: 'Use the tabs to focus: Open needs attention, Answered is waiting on the customer, and Closed is done. Tap All to see everything.',
  },
  {
    icon: <MailIcon size={SZ} />, title: 'Open & reply',
    body: 'Tap any ticket to read the whole conversation, then type your reply at the bottom and Send. The customer gets your message and sees it in their portal.',
  },
  {
    icon: <TagIcon size={SZ} />, title: 'Set the status',
    body: 'After you reply, mark the ticket Answered, or Close it once it\'s resolved. If a customer comes back, you can Reopen a closed ticket anytime.',
  },
  {
    icon: <UsersIcon size={SZ} />, title: 'Need a real person?',
    body: 'Some questions need a teammate — accreditation, payments, an order detail. Loop in the right colleague, reply with what you find, and update the status so nothing falls through the cracks.',
  },
]

export const operationsSteps: TourStep[] = [
  {
    icon: <BoxIcon size={SZ} />, title: 'Welcome, Operations',
    body: 'This is the working queue of job orders from verified customers. Use the tabs at the top to switch between Open, Completed, and other views, and ↻ Refresh to pull the latest.',
  },
  {
    icon: <CheckCircleIcon size={SZ} />, title: 'Accept the order',
    body: 'A new submitted order starts the flow. Tap Approve & process to accept it — that moves it into processing and lets the work begin. Use Hold for info or Reject (with a note) if something\'s missing.',
  },
  {
    icon: <FlaskIcon size={SZ} />, title: 'Assess RPS',
    body: 'Check whether the order needs port-services moves (DEA / inspection). Use Assess RPS to record the moves and any document, or mark No RPS needed. Moves bill per move on top of the base.',
  },
  {
    icon: <EyeIcon size={SZ} />, title: 'Monitor the X-ray',
    body: 'The X-ray itself is confirmed by the Checker, van by van — you don\'t confirm it here. Just keep an eye on each order\'s service progress so you know what\'s still pending.',
  },
  {
    icon: <FlagIcon size={SZ} />, title: 'Complete the services',
    body: 'When an order has several services, mark each one done as it finishes. The order completes on its own once every service is done — and the two-gate rule means it only closes fully once payment is confirmed too.',
  },
  {
    icon: <FlagIcon size={SZ} />, title: 'Move ahead or re-X-ray',
    body: 'Two extra moves live in the ⋯ Actions menu. Request priority bumps an order ahead of the X-ray line once an admin approves it — it gets a P-… number and is served first. And on a completed order, Request re-X-ray creates a suffixed child JO (e.g. JO-000001A) for a fresh X-ray after an admin approves.',
  },
]

export const releaseAdminSteps: TourStep[] = [
  {
    icon: <FolderIcon size={SZ} />, title: 'Releases / Pull-out desk',
    body: 'Container pull-out requests land here (separate from job orders). The flow: a customer files → Verify documents (check the DO/BL) → Set the charge and attach the bill → the customer pays → Confirm the payment → Record the OR → Released. Each step notifies the customer and the right desk.',
  },
  {
    icon: <MoneyIcon size={SZ} />, title: 'Fixing a charge',
    body: 'A wrong charge can be corrected or removed while it\'s still unpaid — a paid charge is locked. Extra charges are added the same way. An unconfirmed extra charge holds up the OR until it\'s settled or removed.',
  },
]

export const vesselSteps: TourStep[] = [
  {
    icon: <ShipIcon size={SZ} />, title: 'Vessel schedule',
    body: 'The calls customers file against. Add one with the form, or bulk-update from your sheet with ⬇ Template then ⬆ Import (matched by vessel-visit, so re-importing updates rather than duplicates).',
  },
  {
    icon: <CameraIcon size={SZ} />, title: 'Last free day & sharing',
    body: 'Last Free Day computes itself (finish discharging + the line\'s free-days), and past calls drop off automatically. Tap Snapshot to share the active vessels straight to your Viber group, and switch to the Calendar view for arrivals by month.',
  },
]
