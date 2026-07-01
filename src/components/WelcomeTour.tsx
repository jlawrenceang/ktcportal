import { type TourStep } from './Tour'
import {
  WaveIcon, IdCardIcon, PinIcon, BellIcon, BoxIcon, ShipIcon, CalculatorIcon,
  GridIcon, RefreshIcon, TagIcon, CalendarIcon, ReceiptIcon, UserIcon, ChatIcon,
} from './icons'

// Per-page customer tours — each page calls usePageTour(key, steps). Steps
// spotlight elements on that page (no cross-page navigation), so a page
// introduces itself the first time the customer lands on it.
const SZ = 26

export const homeSteps: TourStep[] = [
  {
    icon: <WaveIcon size={SZ} />, title: 'Madayaw! Welcome to the KTC Online Portal',
    body: 'File Job Orders for container terminal services from anywhere, anytime. No more queueing at the office. Here\'s a quick look around.',
  },
  {
    icon: <IdCardIcon size={SZ} />, title: 'Get verified', target: '[data-tour="id-banner"]',
    body: 'Upload a valid government ID and a KTC admin will review your account. Filing Job Orders unlocks once a KTC admin reviews and approves your account.',
  },
  {
    icon: <PinIcon size={SZ} />, title: 'Bulletin board', target: '[data-tour="home-bulletin"]',
    body: 'KTC posts announcements here — tap any topic to read the full message.',
  },
  {
    icon: <BellIcon size={SZ} />, title: 'Notifications', target: '[data-tour="nav-bell"]',
    body: 'Updates on your orders land here — KTC replies, approvals, on-hold notices and payment results. The number is how many are unread.',
  },
  {
    icon: <BoxIcon size={SZ} />, title: 'File & track orders', target: '[data-tour="tab-orders"]',
    body: 'Tap Orders to file a new Job Order or follow your existing ones — grouped by filing batch (today / yesterday), with live status, View charges & pay, and Print slip once approved. A badge shows anything needing your action.',
  },
  {
    icon: <ShipIcon size={SZ} />, title: 'Vessel schedule', target: '[data-tour="tab-vessels"]',
    body: 'Check the current vessel calls, berths, and the Last Free Day before you file — so you know your free-storage deadline.',
  },
  {
    icon: <CalculatorIcon size={SZ} />, title: 'Rate calculator', target: '[data-tour="tab-rates"]',
    body: 'Estimate your charges before filing — pick the trade, container counts and services to see the total, VAT and fees included.',
  },
  {
    icon: <GridIcon size={SZ} />, title: 'Explore the app', target: '[data-tour="tab-menu"]',
    body: 'My Account, the user manual, and Settings (language, dark mode, replay this tour) all live under Menu — tap it to explore.',
  },
  {
    icon: <ChatIcon size={SZ} />, title: 'Meet Lara, your assistant', target: '[data-tour="lara-launcher"]',
    body: 'Tap the chat button anytime to ask Lara — she helps you file and track orders, understand charges, and find rates or vessels. If she can\'t answer, she opens a support ticket so a real person follows up.',
  },
  {
    icon: <RefreshIcon size={SZ} />, title: 'Replay anytime', video: true,
    body: 'That\'s the quick tour! Replay it anytime from Menu → Quick tour — or watch the whole portal as a short video below.',
  },
]

export const jobOrderSteps: TourStep[] = [
  {
    icon: <TagIcon size={SZ} />, title: 'Consignee & entry number', target: '[data-tour="jo-consignee"]',
    body: 'Start here: type to search the consignee master list and pick yours, then enter the Entry Number (C-…) from your customs entry. Not listed? Tap Request new consignee — KTC approves it, then it appears here. Track requests under My Requests.',
  },
  {
    icon: <ShipIcon size={SZ} />, title: 'Vessel & voyage', target: '[data-tour="jo-vessel"]',
    body: 'Choose the vessel & voyage from the current schedule. Not listed yet? Contact KTC customer service (or ask Lara) to have it added — only KTC operations can add a vessel.',
  },
  {
    icon: <BoxIcon size={SZ} />, title: 'Add your containers', target: '[data-tour="jo-containers"]',
    body: 'Add each container number and the service it needs — or Bulk paste a whole list at once. Then submit; your order joins today\'s filing batch and you can track each service line from My Orders.',
  },
]

export const myJobOrdersSteps: TourStep[] = [
  {
    icon: <BoxIcon size={SZ} />, title: 'Your job orders live here',
    body: 'All your job orders show here, grouped by filing batch (today / yesterday) with their live status. Track each service line, View charges & pay in advance to speed up processing — then print the paid Job Order slip and present it at the terminal to claim your Official Receipt (OR) and proceed with the service.',
  },
]

export const vesselsCustomerSteps: TourStep[] = [
  {
    icon: <ShipIcon size={SZ} />, title: 'Vessel schedule', target: '[data-tour="vessels-intro"]',
    body: 'The current vessel calls at KTC, updated by our operations team. Please be advised that all vessel schedules are subject to change (delays, advances, etc.) depending on the situation. Check your vessel & voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.',
  },
  {
    icon: <CalendarIcon size={SZ} />, title: 'Table or calendar', target: '[data-tour="vessels-view"]',
    body: 'Switch between the table and the month calendar view. Tick "Show past/cancelled" to also see recent past and cancelled calls.',
  },
]

export const calculatorSteps: TourStep[] = [
  {
    icon: <CalculatorIcon size={SZ} />, title: 'Build your estimate', target: '[data-tour="calc-inputs"]',
    body: 'Go step by step: pick your shipping line & vessel, choose the shipment (import or export), then enter your 20ft and 40ft container counts. Add any ancillary services (X-ray, electrical, storage). Rates are set by KTC.',
  },
  {
    icon: <ReceiptIcon size={SZ} />, title: 'Generate the breakdown', target: '[data-tour="calc-estimate"]',
    body: 'Tap Generate estimate to see the charges — terminal fees + VAT + service fees. This is a guide only; the official amount is confirmed on the Service Invoice at the KTC office.',
  },
]

export const accountSteps: TourStep[] = [
  {
    icon: <UserIcon size={SZ} />, title: 'Your account',
    body: 'Manage your profile here — update your name and contact number, change your email, or reset your password. Changing your legal name needs re-verification by a KTC admin, since it’s matched to your valid ID.',
  },
]

export const releasesSteps: TourStep[] = [
  {
    icon: <BoxIcon size={SZ} />, title: 'Release / Pull-out',
    body: 'Request a container release here — this is separate from a Job Order. File with the BL Number and a photo/PDF of your DO or BL; KTC verifies the documents, assesses the charges (with the bill attached for you to view), and you pay. Track each one through Submitted → Documents verified → Ready for payment → Paid → Released, with a notification at every step. Your account must be approved to file.',
  },
]

export const requestsSteps: TourStep[] = [
  {
    icon: <TagIcon size={SZ} />, title: 'My Requests',
    body: 'Consignees you’ve asked KTC to add show here with their status — Pending, Needs info (edit and resubmit), Approved, or Rejected (adjust the details and request again). Once a consignee is approved it appears in your filing picker so you can file against it.',
  },
]

export const supportSteps: TourStep[] = [
  {
    icon: <ChatIcon size={SZ} />, title: 'Help & Support',
    body: 'Open a support ticket and KTC replies in-app — a ticket moves from Open to Answered to Closed, and replies land in your notifications. For quick questions, tap Lara (the chat button) first; she answers instantly and can open a ticket for you if needed.',
  },
]
