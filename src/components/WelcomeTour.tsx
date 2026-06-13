import { type TourStep } from './Tour'

// Per-page customer tours — each page calls usePageTour(key, steps). Steps
// spotlight elements on that page (no cross-page navigation), so a page
// introduces itself the first time the customer lands on it.

export const homeSteps: TourStep[] = [
  {
    icon: '👋', title: 'Welcome to the KTC Online Portal',
    body: 'File Job Orders for X-ray, DEA exam, and OOG stripping from anywhere — no more queueing at the office. Here\'s a quick look at your home.',
  },
  {
    icon: '🪪', title: 'Get verified once', target: '[data-tour="id-banner"]',
    body: 'Upload a valid government ID here and a KTC admin verifies your account. You can file job orders while you wait — they\'re held and sent to KTC automatically once you\'re approved.',
  },
  {
    icon: '📝', title: 'File a Job Order', target: '[data-tour="home-job-order"]',
    body: 'Your main action — file a new Job Order. We\'ll walk you through the form the first time you open it.',
  },
  {
    icon: '📦', title: 'Track everything', target: '[data-tour="home-job-orders"]',
    body: 'My Job Orders is your home base after filing — live status, your serving number, "View charges & pay", and Print slip once approved.',
  },
  {
    icon: '🧮', title: 'Estimate charges', target: '[data-tour="home-calculator"]',
    body: 'The Rate Calculator estimates fees before you file — pick services and container counts to see the total with VAT and fees.',
  },
  {
    icon: '👤', title: 'Your account', target: '[data-tour="home-account"]',
    body: 'Edit your name, contact number, email and password anytime. (Changing your legal name re-runs verification, since it was matched to your ID.)',
  },
]

export const jobOrderSteps: TourStep[] = [
  {
    icon: '🏷️', title: 'Pick your consignee', target: '[data-tour="jo-consignee"]',
    body: 'Type to search the consignee master list and pick yours.',
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
    body: 'Every order you file shows here with its live status and serving number. Open one to "View charges & pay" (upload your deposit slip) and to Print the A6 slip once it\'s approved. The "Now serving" board up top helps you time your trip to the terminal.',
  },
]

export const vesselsCustomerSteps: TourStep[] = [
  {
    icon: '🚢', title: 'Vessel schedule', target: '[data-tour="vessels-intro"]',
    body: 'The current vessel calls at KTC, maintained by operations. Check your vessel & voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.',
  },
  {
    icon: '🗓️', title: 'Table or calendar', target: '[data-tour="vessels-view"]',
    body: 'Switch between a table and a month calendar (vessels shown on their arrival date). Tick "Show past/cancelled" to see the full history. View only — KTC keeps the schedule up to date.',
  },
]
