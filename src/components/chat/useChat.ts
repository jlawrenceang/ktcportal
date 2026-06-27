// Lara's engine — a useReducer-driven walker. Pure reducer for all sync state;
// two async edges (runAction → ACTIONS, confirmTicket → open_ticket). Entering a
// node pushes its say/body/prompt/intro bubbles; tapping an option pushes a user
// turn then walks to the target. The always-on text input runs the keyword
// matcher with a two-strike rule: after 2 consecutive misses we offer a ticket.

import { useCallback, useReducer, useRef } from 'react'
import { useT } from '../../lib/i18n'
import { supabase } from '../../lib/supabase'
import { NODES } from './nodes'
import { ACTIONS } from './actions'
import { matchText, JO_RE } from './match'
import type { ChatNode, ChatOption, NodeId, TicketCategory } from './types'

export interface ChatMsg {
  id: number
  from: 'bot' | 'user'
  text: string                              // a t() key, unless `literal`
  literal?: boolean                         // already-resolved text (action results, refs)
  vars?: Record<string, string | number>    // interpolation for the t() key
}

export interface ChatState {
  open: boolean
  currentNodeId: NodeId
  messages: ChatMsg[]
  vars: Record<string, string>
  lastUserText: string | null
  pendingCategory: TicketCategory | null     // a matcher near-miss carries its category here
  busy: boolean                              // an action/ticket RPC in flight
  misses: number                             // consecutive free-text matcher misses
  inputError: string | null
  resultOptions: ChatOption[] | null         // options from the last action result
  typing: boolean                            // Lara "is typing…" beat before a deterministic reply
  seq: number
}

type Action =
  | { type: 'OPEN' } | { type: 'CLOSE' } | { type: 'TOGGLE' }
  | { type: 'GOTO'; id: NodeId; misses?: number }
  | { type: 'ENTER_ACTION'; id: NodeId }
  | { type: 'ACTION_RESULT'; bubbles: string[]; options: ChatOption[] }
  | { type: 'PUSH_BOT'; text: string; literal?: boolean; vars?: Record<string, string | number> }
  | { type: 'PUSH_USER'; text: string; literal?: boolean }
  | { type: 'SET_VAR'; key: string; value: string }
  | { type: 'SET_LASTUSER'; text: string }
  | { type: 'SET_PENDING'; category: TicketCategory | null }
  | { type: 'INPUT_ERROR'; error: string }
  | { type: 'BUSY'; busy: boolean }
  | { type: 'TYPING'; typing: boolean }

function initial(): ChatState {
  return {
    open: false, currentNodeId: 'root', messages: [], vars: {}, lastUserText: null,
    pendingCategory: null, busy: false, misses: 0, inputError: null, resultOptions: null, typing: false, seq: 0,
  }
}

// Bubbles a node shows on ENTRY (before its interactive controls). All are t()
// keys; vars carries the captured inputs so {vessel} / {jo} interpolate.
function entryMessages(node: ChatNode, vars: Record<string, string>): Array<{ text: string }> {
  const out: Array<{ text: string }> = []
  const pushSay = (say?: string | string[]) => {
    if (!say) return
    if (Array.isArray(say)) say.forEach((s) => out.push({ text: s }))
    else out.push({ text: say })
  }
  switch (node.kind) {
    case 'options': pushSay(node.say); if (node.prompt) out.push({ text: node.prompt }); break
    case 'message': pushSay(node.say); out.push({ text: node.body }); break
    case 'input': pushSay(node.say); out.push({ text: node.prompt }); break
    case 'nav': pushSay(node.say); out.push({ text: node.body }); break
    case 'ticket': pushSay(node.say); out.push({ text: node.intro }); break
    case 'action': pushSay(node.say); break
  }
  return out.map((m) => ({ text: m.text, vars }))
}

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'OPEN': return { ...state, open: true }
    case 'CLOSE': return { ...state, open: false }
    case 'TOGGLE': return { ...state, open: !state.open }

    case 'GOTO': {
      const id = action.id in NODES ? action.id : 'root'
      const node = NODES[id]
      let seq = state.seq
      const msgs: ChatMsg[] = entryMessages(node, state.vars).map((m) => ({
        id: ++seq, from: 'bot', text: m.text, vars: state.vars,
      }))
      return {
        ...state,
        currentNodeId: id,
        messages: [...state.messages, ...msgs],
        inputError: null,
        resultOptions: null,
        misses: action.misses ?? 0,
        pendingCategory: id === 'root' ? null : state.pendingCategory,
        seq,
      }
    }

    case 'ENTER_ACTION':
      return { ...state, currentNodeId: action.id, busy: true, resultOptions: null, inputError: null, misses: 0 }

    case 'ACTION_RESULT': {
      let seq = state.seq
      const msgs: ChatMsg[] = action.bubbles.map((b) => ({ id: ++seq, from: 'bot', text: b, literal: true }))
      return { ...state, messages: [...state.messages, ...msgs], resultOptions: action.options, busy: false, seq }
    }

    case 'PUSH_BOT': {
      const seq = state.seq + 1
      return { ...state, seq, messages: [...state.messages, { id: seq, from: 'bot', text: action.text, literal: action.literal, vars: action.vars }] }
    }
    case 'PUSH_USER': {
      const seq = state.seq + 1
      return { ...state, seq, messages: [...state.messages, { id: seq, from: 'user', text: action.text, literal: action.literal }] }
    }

    case 'SET_VAR': return { ...state, vars: { ...state.vars, [action.key]: action.value } }
    case 'SET_LASTUSER': return { ...state, lastUserText: action.text }
    case 'SET_PENDING': return { ...state, pendingCategory: action.category }
    case 'INPUT_ERROR': return { ...state, inputError: action.error }
    case 'BUSY': return { ...state, busy: action.busy }
    case 'TYPING': return { ...state, typing: action.typing }
    default: return state
  }
}

export function useChat() {
  const { t } = useT()
  const [state, dispatch] = useReducer(reducer, undefined, initial)
  const stateRef = useRef(state)
  stateRef.current = state

  // varsOverride carries a freshly-captured input (e.g. a just-typed JO number)
  // that hasn't committed to state yet — reading stateRef here would be stale, so
  // the caller passes the fresh value through.
  const runAction = useCallback(async (id: NodeId, varsOverride?: Record<string, string>) => {
    const node = NODES[id]
    if (!node || node.kind !== 'action') return
    try {
      const res = await ACTIONS[node.action](varsOverride ?? stateRef.current.vars, { t })
      dispatch({ type: 'ACTION_RESULT', bubbles: res.bubbles, options: res.options })
    } catch {
      dispatch({
        type: 'ACTION_RESULT',
        bubbles: [t('Sorry, something went wrong. Please try again, or open a ticket and KTC will help.')],
        options: [{ label: 'Try again', to: 'root' }, { label: 'Talk to a person', to: 'talk.input' }],
      })
    }
  }, [t])

  const goTo = useCallback((id: NodeId, opts?: { misses?: number; vars?: Record<string, string> }) => {
    const node = NODES[id]
    if (!node) { dispatch({ type: 'GOTO', id: 'root' }); return }
    if (node.kind === 'action') {
      dispatch({ type: 'ENTER_ACTION', id })
      void runAction(id, opts?.vars)
      return
    }
    dispatch({ type: 'GOTO', id, misses: opts?.misses })
  }, [runAction])

  // Show Lara "typing…" for a beat before a deterministic reply lands, so the chat
  // feels conversational. Action nodes skip it — they show their own "Please wait…".
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const goToTyping = useCallback((id: NodeId, opts?: { misses?: number; vars?: Record<string, string> }) => {
    const target = NODES[id]
    if (!target || target.kind === 'action') { goTo(id, opts); return }
    if (typingTimer.current) clearTimeout(typingTimer.current)
    dispatch({ type: 'TYPING', typing: true })
    typingTimer.current = setTimeout(() => { dispatch({ type: 'TYPING', typing: false }); goTo(id, opts) }, 1400)
  }, [goTo])

  const open = useCallback(() => {
    dispatch({ type: 'OPEN' })
    if (stateRef.current.messages.length === 0) goTo('root')
  }, [goTo])
  const close = useCallback(() => dispatch({ type: 'CLOSE' }), [])
  const toggle = useCallback(() => {
    const wasOpen = stateRef.current.open
    dispatch({ type: 'TOGGLE' })
    if (!wasOpen && stateRef.current.messages.length === 0) goTo('root')
  }, [goTo])

  // Tapping any quick-reply / tile / cancel option.
  const tapOption = useCallback((opt: ChatOption) => {
    dispatch({ type: 'PUSH_USER', text: opt.label })   // keyed → translates
    // Clear stale free-text so a tap-reached ticket node can't inherit an earlier,
    // unrelated line as its subject/body. Legit carry-in flows (talk.input,
    // feedback.*, vessel.add_input) set lastUserText right before navigating, so
    // they're unaffected.
    dispatch({ type: 'SET_LASTUSER', text: '' })
    goToTyping(opt.to)
  }, [goToTyping])

  // Always-on free-text input → matcher (or JO-number shortcut, or ticket).
  const submitText = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text) return
    dispatch({ type: 'PUSH_USER', text, literal: true })
    dispatch({ type: 'SET_LASTUSER', text })
    if (JO_RE.test(text)) {
      dispatch({ type: 'SET_VAR', key: 'jo', value: text })
      goToTyping('track.run', { vars: { ...stateRef.current.vars, jo: text } })  // fresh — not yet in state
      return
    }
    const hit = matchText(text)
    if (hit) {
      dispatch({ type: 'SET_PENDING', category: hit.category })
      goToTyping(hit.to)
      return
    }
    // Miss — two-strike rule: 2nd consecutive miss offers a ticket straight away.
    const nextMiss = stateRef.current.misses + 1
    dispatch({ type: 'SET_PENDING', category: null })
    if (nextMiss >= 2) goToTyping('ticket.fromHere', { misses: 0 })
    else goToTyping('nomatch', { misses: 1 })
  }, [goToTyping])

  // The current input node captured a line.
  const submitInput = useCallback((raw: string) => {
    const node = NODES[stateRef.current.currentNodeId]
    if (!node || node.kind !== 'input') return
    const res = node.validate
      ? node.validate(raw)
      : (raw.trim() ? { ok: true as const, value: raw.trim() } : { ok: false as const, error: 'Please type a few words first.' })
    if (!res.ok) { dispatch({ type: 'INPUT_ERROR', error: res.error }); return }
    dispatch({ type: 'PUSH_USER', text: raw.trim(), literal: true })
    dispatch({ type: 'SET_VAR', key: node.storeAs, value: res.value })
    dispatch({ type: 'SET_LASTUSER', text: res.value })
    goToTyping(node.next, { vars: { ...stateRef.current.vars, [node.storeAs]: res.value } })  // fresh
  }, [goToTyping])

  // On a ticket node, free-typed text becomes the ticket BODY (not a matcher run) —
  // so details a customer types before tapping "Create" aren't lost or misrouted.
  const submitTicketText = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text) return
    dispatch({ type: 'PUSH_USER', text, literal: true })
    dispatch({ type: 'SET_LASTUSER', text })
    // The composer only STAGES the body here — the real send is the separate
    // confirm button. Nudge so a customer who taps "Add" doesn't think it sent.
    dispatch({ type: 'PUSH_BOT', text: 'Got it — tap the button above to send this to KTC.' })
  }, [])

  // Confirm a ticket node → the real open_ticket RPC (single, well-understood write).
  const confirmTicket = useCallback(async () => {
    const node = NODES[stateRef.current.currentNodeId]
    if (!node || node.kind !== 'ticket') return
    dispatch({ type: 'BUSY', busy: true })
    const st = stateRef.current
    const userText = (st.lastUserText ?? '').trim()
    const cat: TicketCategory = (node.inheritCategory && st.pendingCategory) ? st.pendingCategory : node.category
    const subject = ('fixed' in node.subject)
      ? t(node.subject.fixed)
      : (t(node.subject.prefix ?? '') + (userText || t('Help request'))).slice(0, 120)
    const body = ('fixed' in node.body)
      ? t(node.body.fixed)
      : (userText || 'Submitted via the KTC chat assistant — no additional details provided.')

    try {
      // Awaited so the lazy query builder actually executes (real gotcha).
      const { data, error } = await supabase.rpc('open_ticket', { p_subject: subject, p_category: cat, p_body: body })
      if (error || typeof data !== 'string') {
        dispatch({ type: 'PUSH_BOT', text: 'I couldn’t create the ticket right now. You can reach KTC directly on the Support page, or try again.' })
        dispatch({ type: 'SET_PENDING', category: null })
        dispatch({ type: 'GOTO', id: 'ticket.failed' })
      } else {
        const ref = data.slice(0, 8).toUpperCase()
        dispatch({ type: 'PUSH_BOT', text: 'Done — ticket #{ref} is open. KTC will reply in your Support tab; tap Open Support to see it.', vars: { ref } })
        dispatch({ type: 'SET_PENDING', category: null })
        dispatch({ type: 'GOTO', id: 'ticket.done' })
      }
    } catch {
      dispatch({ type: 'PUSH_BOT', text: 'I couldn’t create the ticket right now. You can reach KTC directly on the Support page, or try again.' })
      dispatch({ type: 'GOTO', id: 'ticket.failed' })
    } finally {
      dispatch({ type: 'BUSY', busy: false })
    }
  }, [t])

  return { state, open, close, toggle, tapOption, submitText, submitInput, submitTicketText, confirmTicket }
}
