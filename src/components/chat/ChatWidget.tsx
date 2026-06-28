// Lara — floating launcher + slide-up chat panel. Portaled to document.body so
// position:fixed measures against the viewport (not an ancestor transform), the
// same trick BottomNav uses. Mounted in the customer Shell ONLY. Deterministic:
// every bubble + button comes from the node tree (nodes.ts) via useChat.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useT } from '../../lib/i18n'
import { useChat, type ChatMsg } from './useChat'
import { NODES } from './nodes'
import type { ChatNode, ChatOption } from './types'
import LaraAvatar from '../LaraAvatar'

// Clear the floating bottom tab-bar (sits at bottom:16px, ~64px tall).
const FAB_BOTTOM = 'calc(88px + env(safe-area-inset-bottom, 0px))'

function msgText(m: ChatMsg, t: ReturnType<typeof useT>['t']): string {
  return m.literal ? m.text : t(m.text, m.vars)
}

export default function ChatWidget() {
  const { t } = useT()
  const navigate = useNavigate()
  const { state, open, close, tapOption, submitText, submitInput, submitTicketText, confirmTicket } = useChat()
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLInputElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  const [draft, setDraft] = useState('')
  const [pulse, setPulse] = useState(false)
  // Hide the launcher while a text field is focused so the FAB never sits over
  // the input the user is typing in (visual-roast: FAB covered the email field).
  const [fieldFocused, setFieldFocused] = useState(false)

  // First-open hint once per browser session (mirrors the tour pattern).
  useEffect(() => {
    try { if (!sessionStorage.getItem('ktc_chat_seen')) setPulse(true) } catch { /* ignore */ }
  }, [])

  // Track focus on typing fields anywhere on the page (not the Lara composer —
  // when that's focused the panel is open and the launcher is already hidden).
  useEffect(() => {
    function isField(el: EventTarget | null) {
      const n = el as HTMLElement | null
      if (!n || !n.tagName) return false
      // The Lara composer lives INSIDE the panel — focusing it must not flag a
      // "page field", or an Escape-close can't restore focus to the launcher
      // (it'd still be gated off). Only genuine page inputs hide the FAB.
      if (n.closest('[data-lara-panel]')) return false
      return n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.isContentEditable
    }
    function onIn(e: FocusEvent) { if (isField(e.target)) setFieldFocused(true) }
    function onOut() { setFieldFocused(false) }
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])

  // When the panel closes, clear the flag so the launcher always returns — a
  // focusout may not fire when the focused composer is unmounted (e.g. Escape).
  useEffect(() => { if (!state.open) setFieldFocused(false) }, [state.open])

  // Focus management (WCAG 2.4.3). Non-modal dialog: on open, move focus into the
  // panel (the composer); on close, restore it to the now-remounted launcher.
  // No Tab trap / aria-modal on purpose — Tab must stay free to leave a non-modal
  // dialog (ARIA APG). Tracks prior open so we don't grab focus on first mount.
  useEffect(() => {
    if (state.open) composerRef.current?.focus()
    else if (wasOpenRef.current) launcherRef.current?.focus()
    wasOpenRef.current = state.open
  }, [state.open])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.messages, state.open, state.busy, state.resultOptions, state.typing])

  const node: ChatNode | undefined = NODES[state.currentNodeId]
  const isInput = node?.kind === 'input'

  function launcherClick() {
    setPulse(false)
    try { sessionStorage.setItem('ktc_chat_seen', '1') } catch { /* ignore */ }
    open()
  }

  function navTo(route: string) { close(); navigate(route) }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft
    if (!text.trim() || state.busy || state.typing) return
    setDraft('')
    if (isInput) submitInput(text)
    else if (node?.kind === 'ticket') submitTicketText(text)  // typed details → the ticket body
    else submitText(text)
  }

  // ── Quick-reply / tile buttons ────────────────────────────────────────────
  function Opt({ opt, primary }: { opt: ChatOption; primary?: boolean }) {
    return (
      <button type="button" className={`${primary ? 'ktc-btn' : 'ktc-btn-secondary'} ktc-btn--sm`}
        onClick={() => tapOption(opt)} disabled={state.busy}
        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: 12.5, lineHeight: 1.35 }}>
        {opt.glyph ? <span aria-hidden style={{ marginRight: 6 }}>{opt.glyph}</span> : null}
        <span>{t(opt.label)}</span>
      </button>
    )
  }

  function Tiles({ opts }: { opts: ChatOption[] }) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {opts.map((o) => (
          <button key={o.to + o.label} type="button" className="ktc-btn-secondary"
            onClick={() => tapOption(o)} disabled={state.busy}
            style={{ flexDirection: 'column', gap: 4, padding: '12px 8px', minHeight: 64, textAlign: 'center', fontSize: 12 }}>
            <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>{o.glyph}</span>
            <span style={{ lineHeight: 1.2 }}>{t(o.label)}</span>
          </button>
        ))}
      </div>
    )
  }

  // ── The interactive controls for the current node ─────────────────────────
  function Controls() {
    if (!node) return null
    if (state.typing) return null
    if (state.busy) {
      return <div className="ktc-label" style={{ fontSize: 12.5, padding: '4px 2px' }}>{t('Please wait…')}</div>
    }
    switch (node.kind) {
      case 'options': {
        if (node.layout === 'tiles') {
          const tiles = node.options.filter((o) => o.glyph)
          const rest = node.options.filter((o) => !o.glyph)
          return (
            <div style={{ display: 'grid', gap: 8 }}>
              <Tiles opts={tiles} />
              {rest.map((o) => <Opt key={o.to + o.label} opt={o} />)}
            </div>
          )
        }
        return <div style={{ display: 'grid', gap: 6 }}>{node.options.map((o) => <Opt key={o.to + o.label} opt={o} />)}</div>
      }
      case 'message': {
        const opts = node.then ?? [{ label: 'Back to menu', to: 'root' }]
        return <div style={{ display: 'grid', gap: 6 }}>{opts.map((o) => <Opt key={o.to + o.label} opt={o} />)}</div>
      }
      case 'nav':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <button type="button" className="ktc-btn ktc-btn--sm" onClick={() => navTo(node.route)}
              style={{ width: '100%', fontSize: 12.5 }}>{t(node.cta)} ↗</button>
            {(node.then ?? []).map((o) => <Opt key={o.to + o.label} opt={o} />)}
          </div>
        )
      case 'input':
        return node.altOption
          ? <div style={{ display: 'grid', gap: 6 }}><Opt opt={node.altOption} /></div>
          : null
      case 'action':
        return state.resultOptions
          ? <div style={{ display: 'grid', gap: 6 }}>{state.resultOptions.map((o) => <Opt key={o.to + o.label} opt={o} />)}</div>
          : null
      case 'ticket':
        return (
          <div style={{ display: 'grid', gap: 6 }}>
            <button type="button" className="ktc-btn ktc-btn--sm" onClick={() => void confirmTicket()} disabled={state.busy}
              style={{ width: '100%', fontSize: 12.5 }}>{t(node.confirmLabel)}</button>
            {node.cancelOption ? <Opt opt={node.cancelOption} /> : null}
          </div>
        )
    }
  }

  const placeholder = isInput && node?.kind === 'input' && node.placeholder
    ? t(node.placeholder)
    : node?.kind === 'ticket'
    ? t('Type the details for KTC…')
    : t('Type your question…')

  return createPortal(
    <>
      {/* Launcher — hidden while the panel is open (the panel has its own close)
          or while a text field is focused (so it never covers the input). */}
      {!state.open && !fieldFocused && (
        <button ref={launcherRef} type="button" data-tour="lara-launcher" aria-label={t('Open KTC assistant (Lara)')} onClick={launcherClick}
          style={{
            position: 'fixed', right: 16, bottom: FAB_BOTTOM, zIndex: 60,
            width: 56, height: 56, borderRadius: 999, border: '1px solid var(--glass-brd)', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--acc), var(--acc-2))', color: '#fff',
            boxShadow: 'var(--shadow-lg), 0 10px 26px -8px rgb(var(--acc-rgb) / 0.5)',
            display: 'grid', placeItems: 'center',
          }}>
          <LaraAvatar size={30} />
          {pulse && (
            <span aria-hidden style={{
              position: 'absolute', top: 8, right: 9, width: 11, height: 11, borderRadius: 999,
              background: '#fff', boxShadow: '0 0 0 2px var(--acc-2)',
            }} />
          )}
        </button>
      )}

      {/* Panel */}
      {state.open && (
        <div className="ktc-glass" role="dialog" aria-label={t('KTC assistant — Lara')} data-lara-panel
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
          style={{
            position: 'fixed', right: 16, bottom: FAB_BOTTOM, zIndex: 60,
            width: 'min(380px, calc(100vw - 24px))',
            height: 'min(560px, calc(100dvh - 120px))',
            display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden',
          }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--glass-brd)' }}>
            <span aria-hidden style={{
              width: 32, height: 32, borderRadius: 999, flex: '0 0 auto', display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, var(--acc), var(--acc-2))', color: '#fff',
            }}><LaraAvatar size={20} /></span>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 14, display: 'block' }}>{t('Lara')}</b>
              <span className="ktc-label" style={{ fontSize: 11 }}>{t('KTC Assistant')}</span>
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" aria-label={t('Close')} onClick={close}
              style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
          </div>

          {/* Transcript — a polite live region so appended bot bubbles + the ticket
              success/failure confirmation are announced to screen readers. */}
          <div ref={scrollRef} aria-live="polite" aria-atomic="false"
            style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px', borderRadius: 13, fontSize: 12.5, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: m.from === 'user' ? 'var(--c-h210-60-94)' : 'var(--c-w60)',
                  border: '1px solid var(--glass-brd)',
                }}>
                  {msgText(m, t)}
                </div>
              </div>
            ))}

            {state.typing && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="ktc-chat-typing" aria-hidden><span /><span /><span /></div>
              </div>
            )}
            {/* Live controls for the current node */}
            <div style={{ marginTop: 2 }}><Controls /></div>

            {state.inputError && (
              <div role="alert" style={{ fontSize: 12, fontWeight: 500, color: 'var(--acc-2)' }}>{t(state.inputError)}</div>
            )}
          </div>

          {/* Composer — always-on; runs the matcher, or the current input node */}
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--glass-brd)' }}>
            <input ref={composerRef} className="ktc-input" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder} aria-label={t('Type a message')} disabled={state.busy || state.typing}
              style={{ flex: 1, minWidth: 0 }} />
            <button type="submit" className="ktc-btn ktc-btn--sm" disabled={state.busy || state.typing || !draft.trim()}
              style={{ flex: '0 0 auto' }}>{
                isInput && node?.kind === 'input' ? t(node.submitLabel)
                : node?.kind === 'ticket' ? t('Add')
                : t('Send')
              }</button>
          </form>
        </div>
      )}
    </>,
    document.body,
  )
}
