import { type TourStep } from './Tour'

// Customer walkthrough steps (launched via useTour().startTour from Home / the
// help icon). Each step navigates to the page and spotlights its element;
// returns Home. The "seen once per account" gate lives in lib/tourSeen.

export const customerSteps: TourStep[] = [
  {
    icon: '👋',
    title: 'Welcome to the KTC Online Portal',
    body: 'File Job Orders for X-ray, DEA exam, and OOG stripping from anywhere — no more queueing at the office. Let\'s take a quick look around (about 40 seconds).',
  },
  {
    icon: '🪪',
    title: 'Get verified once',
    target: '[data-tour="id-banner"]',
    body: 'Upload a valid government ID here and a KTC admin verifies your account. You can already file job orders while you wait — they\'re held and sent to KTC automatically the moment you\'re approved.',
  },
  {
    icon: '📝',
    title: 'File a Job Order',
    target: '[data-tour="home-job-order"]',
    body: 'Your main action: file a new Job Order — pick the consignee and vessel, add your containers, and submit. We\'ll open it next.',
  },
  {
    icon: '📦',
    title: 'Track everything',
    target: '[data-tour="home-job-orders"]',
    body: 'My Job Orders is your home base after filing — live status, your serving number, "View charges & pay", and Print slip once approved.',
  },
  {
    icon: '🧮',
    title: 'Estimate charges',
    target: '[data-tour="home-calculator"]',
    body: 'The Rate Calculator estimates fees before you file — pick services and container counts to see the total with VAT and fees.',
  },
  {
    icon: '👤',
    title: 'Your account',
    target: '[data-tour="home-account"]',
    body: 'Edit your name, contact number, email and password anytime. (Changing your legal name re-runs verification, since it was matched to your ID.)',
  },
  {
    icon: '🏷️',
    title: 'Pick your consignee',
    to: '/job-order',
    target: '[data-tour="jo-consignee"]',
    body: 'On the New Job Order form, type to search the consignee master list and pick yours.',
  },
  {
    icon: '🚢',
    title: 'Vessel & voyage',
    to: '/job-order',
    target: '[data-tour="jo-vessel"]',
    body: 'Choose the vessel & voyage from the current schedule. Not listed yet? Tick "vessel not listed" and type it — operations will match it to the call.',
  },
  {
    icon: '🧱',
    title: 'Add your containers',
    to: '/job-order',
    target: '[data-tour="jo-containers"]',
    body: 'Add each container number and the service it needs — or Bulk paste a whole list at once. Then submit; you\'ll get a serving number per service line.',
  },
  {
    icon: '🎫',
    title: 'You\'re ready',
    to: '/job-orders',
    target: 'a[href="/job-orders"]',
    body: 'After filing, everything lives in My Job Orders — serving number, live status, pay online (upload your slip), and print the A6 slip once approved. That\'s it!',
  },
]
