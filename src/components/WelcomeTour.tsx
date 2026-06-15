import { type TourStep } from './Tour'

// Per-page customer tours — each page calls usePageTour(key, steps). Steps
// spotlight elements on that page (no cross-page navigation), so a page
// introduces itself the first time the customer lands on it.

export const homeSteps: TourStep[] = [
  {
    icon: '👋', title: 'Madayaw! Welcome to the KTC Online Portal',
    body: 'File Job Orders for container terminal services from anywhere, anytime. No more queueing at the office. Here\'s a quick look around.',
  },
  {
    icon: '🪪', title: 'Get verified', target: '[data-tour="id-banner"]',
    body: 'Upload a valid government ID and a KTC admin will review your account. You can file Job Orders while you wait — but they\'re held until a KTC admin reviews and approves your account.',
  },
  {
    icon: '📌', title: 'Bulletin board', target: '[data-tour="home-bulletin"]',
    body: 'KTC posts announcements here — tap any topic to read the full message.',
  },
  {
    icon: '🔔', title: 'Notifications', target: '[data-tour="nav-bell"]',
    body: 'Updates on your orders land here — KTC replies, approvals, on-hold notices and payment results. The number is how many are unread.',
  },
  {
    icon: '📦', title: 'File & track orders', target: '[data-tour="tab-orders"]',
    body: 'Tap Orders to file a new Job Order or follow your existing ones — live status, your serving number, View charges & pay, and Print slip once approved. A badge shows anything needing your action.',
  },
  {
    icon: '🚢', title: 'Vessel schedule', target: '[data-tour="tab-vessels"]',
    body: 'Check the current vessel calls, berths, and the Last Free Day before you file — so you know your free-storage deadline.',
  },
  {
    icon: '🧮', title: 'Rate calculator', target: '[data-tour="tab-rates"]',
    body: 'Estimate your charges before filing — pick the trade, container counts and services to see the total, VAT and fees included.',
  },
  {
    icon: '🧭', title: 'Explore the app', target: '[data-tour="tab-menu"]',
    body: 'My Account, the user manual, and Settings (language, dark mode, replay this tour) all live under Menu — tap it to explore.',
  },
  {
    icon: '🔄', title: 'Replay anytime',
    body: 'That\'s the quick tour! To watch it again, open Menu and tap ✨ Quick tour.',
  },
]

export const jobOrderSteps: TourStep[] = [
  {
    icon: '🏷️', title: 'Consignee & entry number', target: '[data-tour="jo-consignee"]',
    body: 'Start here: type to search the consignee master list and pick yours, then enter the Entry Number (C-…) from your customs entry.',
  },
  {
    icon: '🚢', title: 'Vessel & voyage', target: '[data-tour="jo-vessel"]',
    body: 'Choose the vessel & voyage from the current schedule. Not listed yet? Tick "vessel not listed" and type it — operations will match it to the call.',
  },
  {
    icon: '🧱', title: 'Add your containers', target: '[data-tour="jo-containers"]',
    body: 'Add each container number and the service it needs — or Bulk paste a whole list at once. Then submit; you\'ll get a serving number per service line.',
  },
]

export const myJobOrdersSteps: TourStep[] = [
  {
    icon: '📦', title: 'Your job orders live here',
    body: 'All your job orders show here with their status and priority number. View the estimated charges and pay in advance to speed up processing — then print the paid Job Order slip and present it at the terminal to claim your Official Receipt (OR) and proceed with the service.',
  },
]

export const vesselsCustomerSteps: TourStep[] = [
  {
    icon: '🚢', title: 'Vessel schedule', target: '[data-tour="vessels-intro"]',
    body: 'The current vessel calls at KTC, updated by our operations team. Please be advised that all vessel schedules are subject to change (delays, advances, etc.) depending on the situation. Check your vessel & voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.',
  },
  {
    icon: '🗓️', title: 'Table or calendar', target: '[data-tour="vessels-view"]',
    body: 'Switch between the table and the month calendar view. Tick "Show past/cancelled" to see the full history.',
  },
]

export const calculatorSteps: TourStep[] = [
  {
    icon: '🧮', title: 'Build your estimate', target: '[data-tour="calc-inputs"]',
    body: 'Go step by step: pick your shipping line & vessel, choose the shipment (import or export), then enter your 20ft and 40ft container counts. Add any ancillary services (X-ray, electrical, storage). Rates are set by KTC.',
  },
  {
    icon: '🧾', title: 'Generate the breakdown', target: '[data-tour="calc-estimate"]',
    body: 'Tap Generate estimate to see the charges — terminal fees + VAT + service fees. This is a guide only; the official amount is confirmed on the Service Invoice at the KTC office.',
  },
]

export const accountSteps: TourStep[] = [
  {
    icon: '👤', title: 'Your account',
    body: 'Manage your profile here — update your name and contact number, change your email, or reset your password. Changing your legal name needs re-verification by a KTC admin, since it’s matched to your valid ID.',
  },
]
