import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useFileViewer } from './FileViewerModal'
import { useT } from '../lib/i18n'

// Customer bulletin board (Home): admin-posted topics (migration 0076). Tapping
// a topic opens its full message in a modal — no page navigation. A post may
// carry one attachment (a memo), opened in a nested in-app viewer (0113).
type Post = { id: string; title: string; body: string; pinned: boolean; created_at: string; attachment_path: string | null; attachment_name: string | null }

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BulletinBoard() {
  const { t } = useT()
  const [posts, setPosts] = useState<Post[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Post | null>(null)
  const [fileErr, setFileErr] = useState<string | null>(null)
  // Nested viewer for the post's attachment (a memo). Portaled to <body> so it
  // sits above this post modal regardless of stacking context.
  const { openFromStorage, viewerModal } = useFileViewer(setFileErr)

  useEffect(() => {
    void supabase.from('bulletin_posts').select('id, title, body, pinned, created_at, attachment_path, attachment_name')
      .eq('is_published', true)
      .order('pinned', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data }) => setPosts((data ?? []) as Post[]))
    void supabase.from('bulletin_reads').select('post_id')
      .then(({ data }) => setReadIds(new Set(((data ?? []) as { post_id: string }[]).map((r) => r.post_id))))
  }, [])

  function openPost(p: Post) {
    setOpen(p)
    if (!readIds.has(p.id)) {
      setReadIds((prev) => new Set(prev).add(p.id))
      void supabase.rpc('mark_bulletin_read', { p_post: p.id }).then(() => undefined, () => undefined)
    }
  }

  if (posts.length === 0) return null

  return (
    <div className="ktc-glass ktc-bulletin" data-tour="home-bulletin">
      <h2 className="ktc-bulletin-title">📌 {t('Bulletin board')}</h2>
      <div className="ktc-board-list">
        {posts.map((p) => (
          <button key={p.id} type="button" className="ktc-board-item" onClick={() => openPost(p)}>
            {!readIds.has(p.id) && <span aria-hidden className="ktc-board-unread" title={t('New')} />}
            <span className="ktc-board-item-main">
              {p.pinned && <span className="ktc-chip ktc-chip--accent" style={{ fontSize: 10 }}>{t('Pinned')}</span>}
              <span className="ktc-board-item-title" style={{ fontWeight: readIds.has(p.id) ? 500 : 700 }}>{p.title}</span>
            </span>
            <span className="ktc-board-item-date ktc-label">{fmtDate(p.created_at)}</span>
            <span aria-hidden className="ktc-board-item-chev">›</span>
          </button>
        ))}
      </div>

      {/* Portal to <body>: the bulletin card is a .ktc-glass element, and
          backdrop-filter creates a stacking context that would otherwise trap
          this fixed modal beneath the bottom tab bar (z-index 45). */}
      {open && createPortal(
        <div className="ktc-modal-backdrop" onClick={() => setOpen(null)}>
          <div className="ktc-glass ktc-modal-panel" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--glass-brd)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, wordBreak: 'break-word' }}>{open.title}</div>
                <div className="ktc-label" style={{ fontSize: 11.5, marginTop: 3 }}>{fmtDate(open.created_at)}</div>
              </div>
              <button type="button" aria-label={t('Close')} onClick={() => setOpen(null)}
                style={{ fontSize: 20, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', flex: '0 0 auto' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px', fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {open.body}
            </div>
            {open.attachment_path && (
              <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--glass-brd)' }}>
                <button type="button" className="ktc-btn-secondary ktc-btn--sm"
                  onClick={() => { setFileErr(null); void openFromStorage('bulletin-files', open.attachment_path, open.attachment_name || open.title) }}>
                  📎 {t('View attachment')}
                </button>
                {open.attachment_name && (
                  <span className="ktc-label" style={{ fontSize: 11.5, marginLeft: 10 }}>{open.attachment_name}</span>
                )}
                {fileErr && <div style={{ color: 'var(--acc-2)', fontSize: 12, marginTop: 6 }}>{fileErr}</div>}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* The attachment viewer is a modal-within-a-modal — portal it to <body>
          so it renders above the post modal. */}
      {viewerModal && createPortal(viewerModal, document.body)}
    </div>
  )
}
