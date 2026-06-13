// Tagalog (Filipino) translations, keyed by the English source string.
//
// House style: natural conversational Filipino, but KEEP widely-used English
// technical/industry terms that Filipino brokers and KTC staff actually say —
// "Job Order", "container", "X-ray", "consignee", "voyage", "berth", "email",
// "password", "verify". This Taglish register is how the terminal talks; do not
// force literal translations of jargon. Sentence-style UI copy gets translated;
// short field labels often stay bilingual-friendly.
//
// Anything missing here falls back to English (see i18n.tsx), so partial
// coverage is safe. Owner reviews wording before go-live.

export const tl: Record<string, string> = {
  // ── Navigation / shell (seed; workflow extends this) ──
  'Home': 'Home',
  'New Job Order': 'Bagong Job Order',
  'My Job Orders': 'Mga Job Order Ko',
  'Vessels': 'Mga Barko',
  'Rates': 'Mga Singil',
  'My Account': 'Aking Account',
  'Sign out': 'Mag-sign out',
  'User Manual': 'Gabay sa Paggamit',
  'Manual': 'Gabay',
  'Language': 'Wika',
  'English': 'English',
  'Filipino': 'Filipino',
  "Show this page's walkthrough": 'Ipakita ang gabay sa pahinang ito',
  'Customer Agreement (Terms & Conditions)': 'Kasunduan ng Customer (Mga Tuntunin at Kundisyon)',

  // ── Tour controls (Tour.tsx) ──
  '← Back': '← Bumalik',
  'Next →': 'Susunod →',
  'Done 🚀': 'Tapos 🚀',
  'Skip the tour': 'Laktawan ang gabay',

  // ── Home (pages/Home.tsx) ──
  'Welcome': 'Maligayang pagdating',
  'Welcome, {name}': 'Maligayang pagdating, {name}',
  'File job orders for terminal services and track them through processing.':
    'Mag-file ng mga Job Order para sa mga serbisyo ng terminal at i-track ang mga ito habang pinoproseso.',
  'Quick tour ▸': 'Mabilis na gabay ▸',
  'File for X-ray, DEA or OOG stripping services': 'Mag-file para sa X-ray, DEA o OOG stripping na serbisyo',
  'Track statuses, pay, and print approved slips': 'I-track ang status, magbayad, at i-print ang mga aprubadong slip',
  'Vessel Schedule': 'Iskedyul ng mga Barko',
  'Current calls, berths & last free day': 'Mga kasalukuyang barko, berth at huling free day',
  'Rate Calculator': 'Kalkulador ng Singil',
  'Estimate charges before you file': 'Tantiyahin ang singil bago mag-file',
  'Profile, email & password': 'Profile, email at password',

  // ── Customer vessel page (pages/Vessels.tsx) + tour ──
  'Table': 'Talahanayan',
  'Calendar': 'Kalendaryo',
  'Show past/cancelled': 'Ipakita ang nakaraan/kanselado',
  'Loading…': 'Naglo-load…',
  'Visit': 'Visit',
  'Vessel': 'Barko',
  'Voyage': 'Voyage',
  'Line': 'Line',
  'Arrival': 'Pagdating',
  'Finish Disch.': 'Tapos Disch.',
  'Last Free Day': 'Huling Free Day',
  'Berth': 'Berth',
  'current': 'kasalukuyan',
  'past': 'nakaraan',
  'cancelled': 'kanselado',
  'total': 'kabuuan',
  '{count} {scope} call(s)': '{count} na {scope} na barko',
  'No vessel calls right now.': 'Walang barko sa ngayon.',
  'No current vessel calls right now.': 'Walang kasalukuyang barko sa ngayon.',
  "Current vessel calls at KTC. Last free day is the last day of free storage (finish discharging + the line's free-days); after it, storage charges apply. Schedule is maintained by KTC operations — for reference only.":
    'Mga kasalukuyang barko sa KTC. Ang huling free day ang huling araw ng libreng storage (tapos mag-discharge + ang free-days ng line); pagkatapos nito, may storage charges na. Pinapanatili ng KTC operations ang iskedyul — para sa rep-erensya lamang.',

  // ── Customer vessel tour (vesselsCustomerSteps) ──
  'Vessel schedule': 'Iskedyul ng mga barko',
  'The current vessel calls at KTC, maintained by operations. Check your vessel & voyage before filing, and watch the Last Free Day — the last day of free storage before charges start.':
    'Ang mga kasalukuyang barko sa KTC, pinapanatili ng operations. Tingnan ang iyong barko at voyage bago mag-file, at bantayan ang Huling Free Day — ang huling araw ng libreng storage bago magsimula ang singil.',
  'Table or calendar': 'Talahanayan o kalendaryo',
  'Switch between a table and a month calendar (vessels shown on their arrival date). Tick "Show past/cancelled" to see the full history. View only — KTC keeps the schedule up to date.':
    'Magpalit sa pagitan ng talahanayan at buwanang kalendaryo (ipinapakita ang mga barko sa petsa ng pagdating). I-tsek ang "Ipakita ang nakaraan/kanselado" para makita ang buong kasaysayan. Tingnan lang — KTC ang nag-a-update ng iskedyul.',
}
