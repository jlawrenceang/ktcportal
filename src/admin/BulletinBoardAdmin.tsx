import { useEffect, useRef, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { useFileViewer } from '../components/FileViewerModal'
import { useT } from '../lib/i18n'

// Bulletin board manager (its own page, 2026-06-17 — moved out of Settings).
// Admin/owner post announcements shown on every customer's Home. Each post can
// carry ONE attachment (a memo / official document) that customers open in an
// in-app viewer from the post's modal.
type Bulletin = {
  id: string
  title: string
  body: string
  is_published: boolean
  pinned: boolean
  created_at: string
  attachment_path: string | null
  attachment_name: string | null
}

export default function BulletinBoardAdmin() {
  const { t } = useT()
  const { broker } = useBroker()
  const canEdit = hasAdminAccess(broker)

  const [posts, setPosts] = useState<Bulletin[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setError)

  async function load() {
    const { data } = await supabase.from('bulletin_posts')
      .select('id, title, body, is_published, pinned, created_at, attachment_path, attachment_name')
      .order('pinned', { ascending: false }).order('created_at', { ascending: false })
    setPosts((data ?? []) as Bulletin[])
  }
  useEffect(() => { void load() }, [])

  async function addPost() {
    if (!title.trim() || !body.trim()) { setMsg(t('Enter a title and a message.')); return }
    setBusy(true); setMsg(null); setError(null)
    let attachment_path: string | null = null
    let attachment_name: string | null = null
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('bulletin-files').upload(path, file, { upsert: false })
      if (upErr) { setBusy(false); setError(upErr.message); return }
      attachment_path = path
      attachment_name = file.name
    }
    const { error: insErr } = await supabase.from('bulletin_posts')
      .insert({ title: title.trim(), body: body.trim(), attachment_path, attachment_name })
    setBusy(false)
    if (insErr) { setError(insErr.message); return }
    setTitle(''); setBody(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
    setMsg(t('✓ Posted to the bulletin board.'))
    await load()
  }

  async function patchPost(b: Bulletin, patch: Partial<Bulletin>) {
    const { error: e } = await supabase.from('bulletin_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (e) { setError(e.message); return }
    await load()
  }

  async function delPost(b: Bulletin) {
    const { error: e } = await supabase.from('bulletin_posts').delete().eq('id', b.id)
    if (e) { setError(e.message); return }
    // Best-effort: drop the attachment too (orphaned files would otherwise linger).
    if (b.attachment_path) void supabase.storage.from('bulletin-files').remove([b.attachment_path])
    await load()
  }

  if (!canEdit) {
    return (
      <AdminShell>
        <div className="ktc-glass" style={{ padding: 18 }}>
          <h1 className="ktc-title">{t('Bulletin board')}</h1>
          <p className="ktc-label" style={{ fontSize: 14, marginTop: 8 }}>
            {t('Only admins can manage the bulletin board.')}
          </p>
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <div className="ktc-glass" style={{ padding: 18 }}>
        <h1 className="ktc-title">{t('Bulletin board')}</h1>
        <p className="ktc-sub" style={{ marginBottom: 16 }}>
          {t('Announcements shown on every customer’s Home. Each post is a topic customers tap to read in full — attach a memo file and they can open it from the post.')}
        </p>

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 500, color: 'var(--acc-2)', padding: '10px 14px', borderRadius: 10, background: 'var(--c-h0-75-97)', border: '1px solid var(--c-h0-70-88)' }} role="alert">
            {error}
          </div>
        )}

        {/* Composer */}
        <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
          <input className="ktc-input ktc-input--compact" placeholder={t('Topic title')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="ktc-input ktc-input--compact" rows={3} placeholder={t('Message')} value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="ktc-btn-secondary ktc-btn--sm" style={{ cursor: 'pointer' }}>
              {file ? t('Change file') : t('📎 Attach memo (optional)')}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && (
              <span className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {file.name}
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }}
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>{t('Remove')}</button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="ktc-btn ktc-btn--sm" type="button" disabled={busy} onClick={() => void addPost()} style={{ width: 'auto', padding: '9px 18px' }}>
              {busy ? t('Posting…') : t('Post to board')}
            </button>
            {msg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>

        {/* Existing posts */}
        {posts.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 18, maxWidth: 600 }}>
            {posts.map((b) => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: b.is_published ? 'var(--c-w55)' : 'var(--c-w30)', border: '1px solid var(--glass-brd)', opacity: b.is_published ? 1 : 0.6 }}>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pinned ? '📌 ' : ''}{b.title}</span>
                  <span className="ktc-label" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {b.is_published ? t('Published') : t('Draft')}
                    {b.attachment_path && (
                      <button type="button" className="ktc-link" style={{ fontSize: 11.5 }}
                        onClick={() => void openFromStorage('bulletin-files', b.attachment_path, b.attachment_name || t('Attachment'))}>
                        📎 {t('View file')}
                      </button>
                    )}
                  </span>
                </span>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchPost(b, { pinned: !b.pinned })}>{b.pinned ? t('Unpin') : t('Pin')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchPost(b, { is_published: !b.is_published })}>{b.is_published ? t('Hide') : t('Publish')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }} onClick={() => void delPost(b)}>{t('Delete')}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewerModal}
    </AdminShell>
  )
}
