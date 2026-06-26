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
  const [draft, setDraft] = useState('')
  const [pulse, setPulse] = useState(false)

  // First-open hint once per browser session (mirrors the tour pattern).
  useEffect(() => {
    try { if (!sessionStorage.getItem('ktc_chat_seen')) setPulse(true) } catch { /* ignore */ }
  }, [])

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [state.messages, state.open, state.busy, state.resultOptions])

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
    if (!text.trim() || state.busy) return
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
      {/* Launcher — hidden while the panel is open (the panel has its own close). */}
      {!state.open && (
        <button type="button" aria-label={t('Open KTC assistant (Lara)')} onClick={launcherClick}
          style={{
            position: 'fixed', right: 16, bottom: FAB_BOTTOM, zIndex: 60,
            width: 56, height: 56, borderRadius: 999, border: '1px solid var(--glass-brd)', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--acc), var(--acc-2))', color: '#fff',
            boxShadow: 'var(--shadow-lg), 0 10px 26px -8px rgb(var(--acc-rgb) / 0.5)',
            display: 'grid', placeItems: 'center', fontSize: 24,
          }}>
          <span aria-hidden>💬</span>
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
        <div className="ktc-glass" role="dialog" aria-label={t('KTC assistant — Lara')}
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
              background: 'linear-gradient(135deg, var(--acc), var(--acc-2))', color: '#fff', fontSize: 16,
            }}>💬</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ fontSize: 14, display: 'block' }}>{t('Lara')}</b>
              <span className="ktc-label" style={{ fontSize: 11 }}>{t('KTC Assistant')}</span>
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" aria-label={t('Close')} onClick={close}
              style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))' }}>✕</button>
          </div>

          {/* Transcript */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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

            {/* Live controls for the current node */}
            <div style={{ marginTop: 2 }}><Controls /></div>

            {state.inputError && (
              <div role="alert" style={{ fontSize: 12, fontWeight: 500, color: 'var(--acc-2)' }}>{t(state.inputError)}</div>
            )}
          </div>

          {/* Composer — always-on; runs the matcher, or the current input node */}
          <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: '1px solid var(--glass-brd)' }}>
            <input className="ktc-input" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder} aria-label={t('Type a message')} disabled={state.busy}
              style={{ flex: 1, minWidth: 0, fontSize: 13 }} />
            <button type="submit" className="ktc-btn ktc-btn--sm" disabled={state.busy || !draft.trim()}
              style={{ flex: '0 0 auto' }}>{isInput && node?.kind === 'input' ? t(node.submitLabel) : t('Send')}</button>
          </form>
        </div>
      )}
    </>,
    document.body,
  )
}
