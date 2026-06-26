// Free-text matcher for Lara's always-on input. NO AI: a flat keyword/synonym
// table scored by matched stems. English + Tagalog/Taglish stems live side by
// side so a typed question routes to the right topic node. A miss returns null
// and the engine routes to a graceful ticket offer (two-strike rule in useChat).

import type { NodeId, TicketCategory } from './types'

export interface TopicMatcher { to: NodeId; category: TicketCategory; keywords: string[] }

// Order matters: ties are resolved to the EARLIEST matcher.
export const MATCHERS: TopicMatcher[] = [
  { to: 'track.input', category: 'job_order',
    keywords: ['track', 'status', 'where is my', 'saan na', 'status ng order', 'jo-', 'update ng', 'nasaan', 'order ko'] },
  { to: 'file.how', category: 'job_order',
    keywords: ['file', 'new order', 'mag-file', 'gumawa ng order', 'paano mag', 'submit order', 'x-ray request', 'xray', 'dea', 'oog', 'job order'] },
  { to: 'pay.root', category: 'payment',
    keywords: ['pay', 'payment', 'bayad', 'magkano', 'charge', 'vat', 'gcash', 'qrph', 'deposit slip', 'invoice', 'balance', 'singil', 'receipt', 'rate', 'rates', 'calculator', 'estimate', 'rps', 'resibo'] },
  { to: 'vessel.root', category: 'operations',
    keywords: ['vessel', 'voyage', 'schedule', 'last free day', 'lfd', 'barko', 'storage', 'demurrage', 'berth', 'arrival'] },
  { to: 'rel.root', category: 'operations',
    keywords: ['release', 'pull-out', 'pullout', 'pull out', 'bl', 'bill of lading', 'delivery order', 'claim', 'kuha ng container', 'gate pass', 'or number'] },
  { to: 'acct.root', category: 'account',
    keywords: ['verify', 'valid id', 'approval', 'approve', 'pending', 'id upload', 're-verify', 'account approved', 'accredit', 'register', 'sign up', 'verification'] },
  { to: 'consignee.add', category: 'accreditation',
    keywords: ['consignee', '2303', 'add consignee', 'bagong consignee', 'master list'] },
  { to: 'login.help', category: 'account',
    keywords: ['login', 'log in', 'password', 'locked out', 'sign out', 'idle', 'session', 'hindi maka-login', 'logged out', 'sign in'] },
  { to: 'feedback.root', category: 'customer_service',
    keywords: ['complaint', 'complain', 'reklamo', 'suggestion', 'suggest', 'feedback', 'concern', 'mungkahi', 'customs', 'shipping line', 'logistics', 'trucking'] },
  { to: 'bug.report', category: 'app_system',
    keywords: ['bug', 'error', 'not working', 'broken', 'crash', 'blank', 'hindi gumagana', 'ayaw mag-load', 'glitch'] },
]

// Short acronym stems that collide with common words as substrings ("bl" in
// "blank", "dea" in "idea", "vat" in "private", "oog" in "google") must match as a
// whole token, not a substring. Longer keywords stay substring so stems still work
// ("pay" → "payment"/"paying").
const WHOLE_WORD = new Set(['bl', 'dea', 'vat', 'oog'])
function hit(s: string, k: string): boolean {
  if (WHOLE_WORD.has(k)) return new RegExp('(?:^|[^a-z0-9])' + k + '(?:[^a-z0-9]|$)', 'i').test(s)
  return s.includes(k)
}

/** Score by matched stems; require >=1. Ties → earliest matcher. */
export function matchText(raw: string): TopicMatcher | null {
  const s = raw.toLowerCase()
  let best: { m: TopicMatcher; score: number } | null = null
  for (const m of MATCHERS) {
    const score = m.keywords.reduce((n, k) => (hit(s, k) ? n + 1 : n), 0)
    if (score > 0 && (!best || score > best.score)) best = { m, score }
  }
  return best?.m ?? null
}

/** Typing a JO number IS a track request: "JO12" / "jo-000123" / a bare "123456"
 *  (normalizeJo pads it to JO-00xxxx). 4–6 bare digits avoids tiny ambiguous numbers. */
export const JO_RE = /^(?:jo-?\d{1,6}|\d{4,6})$/i
