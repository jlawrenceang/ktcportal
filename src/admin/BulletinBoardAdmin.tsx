import { useEffect, useRef, useState } from 'react'
import AdminShell from './AdminShell'
import { supabase } from '../lib/supabase'
import { useBroker } from '../lib/useBroker'
import { hasAdminAccess } from '../lib/types'
import { useFileViewer } from '../components/FileViewerModal'
import { useT } from '../lib/i18n'
import { PinIcon, PaperclipIcon, PencilIcon } from '../components/icons'

// Bulletin board manager (its own page, 2026-06-17 — moved out of Settings).
// Admin/owner post announcements shown on every customer's Home. Each post can
// carry ONE attachment (a memo / official document) that customers open in an
// in-app viewer from the post's modal. Posts support draft/pin at creation,
// manual reordering (sort_order), and a schedule/expiry window (migration 0192).
type Bulletin = {
  id: string
  title: string
  body: string
  is_published: boolean
  pinned: boolean
  sort_order: number
  publish_at: string
  expires_at: string | null
  archived_at: string | null
  archived_by: string | null
  created_at: string
  attachment_path: string | null
  attachment_name: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
// timestamptz → value for an <input type="datetime-local"> (local wall-clock).
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
// <input type="datetime-local"> value (local) → ISO timestamptz (UTC), or null.
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export default function BulletinBoardAdmin() {
  const { t } = useT()
  const { broker } = useBroker()
  const canEdit = hasAdminAccess(broker)

  const [posts, setPosts] = useState<Bulletin[]>([])
  const [editing, setEditing] = useState<Bulletin | null>(null) // T3-21: post under edit, else null = create
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [removeAttachment, setRemoveAttachment] = useState(false) // T3-21: drop the existing attachment on save
  const [draft, setDraft] = useState(false)        // T3-24: create/save as draft (hidden) vs published
  const [pinnedNew, setPinnedNew] = useState(false) // T3-24: pin in one step at creation
  const [publishAt, setPublishAt] = useState('')   // T3-23: schedule go-live (datetime-local string)
  const [expiresAt, setExpiresAt] = useState('')   // T3-23: auto-expiry (datetime-local string)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { openFromStorage, viewerModal } = useFileViewer(setError)

  async function load() {
    const { data } = await supabase.from('bulletin_posts')
      .select('id, title, body, is_published, pinned, sort_order, publish_at, expires_at, archived_at, archived_by, created_at, attachment_path, attachment_name')
      .order('pinned', { ascending: false }).order('sort_order', { ascending: true }).order('created_at', { ascending: false })
    setPosts((data ?? []) as Bulletin[])
  }
  useEffect(() => { void load() }, [])

  // T3-21: reset the composer back to a fresh "create" state.
  function resetComposer() {
    setEditing(null); setTitle(''); setBody(''); setFile(null); setRemoveAttachment(false)
    setDraft(false); setPinnedNew(false); setPublishAt(''); setExpiresAt('')
    if (fileRef.current) fileRef.current.value = ''
  }

  // T3-21: load an existing post into the composer to edit it in place.
  function startEdit(b: Bulletin) {
    setEditing(b)
    setTitle(b.title); setBody(b.body)
    setDraft(!b.is_published); setPinnedNew(b.pinned)
    setPublishAt(toLocalInput(b.publish_at)); setExpiresAt(toLocalInput(b.expires_at))
    setFile(null); setRemoveAttachment(false)
    if (fileRef.current) fileRef.current.value = ''
    setMsg(null); setError(null)
  }

  // Create a new post OR save edits to the one in `editing` (T3-21/23/24).
  async function submit() {
    if (!title.trim() || !body.trim()) { setMsg(t('Enter a title and a message.')); return }
    setBusy(true); setMsg(null); setError(null)

    // Upload a (replacement) attachment up-front if one was chosen.
    let newPath: string | null = null
    let newName: string | null = null
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'dat'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('bulletin-files').upload(path, file, { upsert: false })
      if (upErr) { setBusy(false); setError(upErr.message); return }
      newPath = path
      newName = file.name
    }

    // Shared fields. T3-24 draft/pin + T3-23 schedule window. publish_at is
    // NOT NULL — fall back to now() if the field is blank.
    const base = {
      title: title.trim(),
      body: body.trim(),
      is_published: !draft,
      pinned: pinnedNew,
      publish_at: fromLocalInput(publishAt) ?? new Date().toISOString(),
      expires_at: fromLocalInput(expiresAt),
    }

    if (editing) {
      // Attachment: replace (new file), drop (toggle), or leave as-is.
      const attachPatch = file
        ? { attachment_path: newPath, attachment_name: newName }
        : removeAttachment
          ? { attachment_path: null, attachment_name: null }
          : {}
      const { error: e } = await supabase.from('bulletin_posts')
        .update({ ...base, ...attachPatch, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
      setBusy(false)
      if (e) { setError(e.message); return }
      // Best-effort: drop the old file when it was replaced or removed.
      if (editing.attachment_path && (file || removeAttachment)) {
        void supabase.storage.from('bulletin-files').remove([editing.attachment_path])
      }
      resetComposer()
      setMsg(t('✓ Changes saved.'))
    } else {
      const { error: insErr } = await supabase.from('bulletin_posts')
        .insert({ ...base, attachment_path: newPath, attachment_name: newName })
      setBusy(false)
      if (insErr) { setError(insErr.message); return }
      resetComposer()
      setMsg(t('✓ Posted to the bulletin board.'))
    }
    await load()
  }

  async function patchPost(b: Bulletin, patch: Partial<Bulletin>) {
    const { error: e } = await supabase.from('bulletin_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (e) { setError(e.message); return }
    await load()
  }

  // T3-22: move a post up/down and persist sort_order (which drives customer
  // ordering). bulletin_posts has NOT NULL title/body, so a partial-column
  // upsert would fail the insert path — write the changed rows with .update()
  // instead. Lists are short, so renumbering by position is cheap + robust.
  async function reorder(idx: number, dir: -1 | 1) {
    const active = posts.filter((p) => !p.archived_at)
    const j = idx + dir
    if (j < 0 || j >= active.length) return
    const next = [...active]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setPosts([...next, ...posts.filter((p) => p.archived_at)]) // optimistic
    const updatedAt = new Date().toISOString()
    for (let i = 0; i < next.length; i++) {
      if (next[i].sort_order !== i) {
        const { error: e } = await supabase.from('bulletin_posts').update({ sort_order: i, updated_at: updatedAt }).eq('id', next[i].id)
        if (e) { setError(e.message); break }
      }
    }
    await load()
  }

  async function archivePost(b: Bulletin) {
    const { error: e } = await supabase.from('bulletin_posts')
      .update({ archived_at: new Date().toISOString(), archived_by: broker?.user_id ?? null, updated_at: new Date().toISOString() })
      .eq('id', b.id)
    if (e) { setError(e.message); return }
    if (editing?.id === b.id) resetComposer()
    setMsg(t('Archived.'))
    await load()
  }

  async function restorePost(b: Bulletin) {
    const { error: e } = await supabase.from('bulletin_posts')
      .update({ archived_at: null, archived_by: null, updated_at: new Date().toISOString() })
      .eq('id', b.id)
    if (e) { setError(e.message); return }
    setMsg(t('Restored to active posts.'))
    await load()
  }

  async function delPost(b: Bulletin) {
    const { error: e } = await supabase.from('bulletin_posts').delete().eq('id', b.id)
    if (e) { setError(e.message); return }
    // Best-effort: drop the attachment too (orphaned files would otherwise linger).
    if (b.attachment_path) void supabase.storage.from('bulletin-files').remove([b.attachment_path])
    if (editing?.id === b.id) resetComposer()
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

  const now = Date.now()
  const activePosts = posts.filter((b) => !b.archived_at)
  const archivedPosts = posts.filter((b) => b.archived_at)

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

        {/* Composer (doubles as the editor — T3-21) */}
        <div style={{ display: 'grid', gap: 8, maxWidth: 600 }}>
          {editing && (
            <div className="ktc-label" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--acc-2)', fontWeight: 600 }}>
              <PencilIcon size={13} /> {t('Editing “{title}”', { title: editing.title })}
            </div>
          )}
          <input className="ktc-input ktc-input--compact" placeholder={t('Topic title')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea className="ktc-input ktc-input--compact" rows={3} placeholder={t('Message')} value={body} onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="ktc-btn-secondary ktc-btn--sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {file ? t('Change file') : <><PaperclipIcon size={14} /> {editing?.attachment_path ? t('Replace memo') : t('Attach memo (optional)')}</>}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRemoveAttachment(false) }} />
            </label>
            {file && (
              <span className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {file.name}
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }}
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>{t('Remove')}</button>
              </span>
            )}
            {/* T3-21: existing attachment on the post being edited — keep or drop it */}
            {editing && editing.attachment_path && !file && (
              <span className="ktc-label" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {removeAttachment
                  ? <s>{editing.attachment_name || t('Attachment')}</s>
                  : (editing.attachment_name || t('Attachment'))}
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: removeAttachment ? 'var(--acc-1)' : 'var(--acc-2)' }}
                  onClick={() => setRemoveAttachment((v) => !v)}>{removeAttachment ? t('Keep') : t('Remove')}</button>
              </span>
            )}
          </div>
          {/* T3-23: schedule / expiry window */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="ktc-label" style={{ fontSize: 12 }}>{t('Publish at (optional)')}</span>
              <input className="ktc-input ktc-input--compact" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="ktc-label" style={{ fontSize: 12 }}>{t('Expires at (optional)')}</span>
              <input className="ktc-input ktc-input--compact" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={{ fontSize: 13, minWidth: 0 }} />
            </label>
          </div>
          {/* T3-24: publish/draft + pin at creation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <label className="ktc-label" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
              {t('Save as draft (hidden until published)')}
            </label>
            <label className="ktc-label" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={pinnedNew} onChange={(e) => setPinnedNew(e.target.checked)} />
              {t('Pin to top')}
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="ktc-btn ktc-btn--sm" type="button" disabled={busy} onClick={() => void submit()} style={{ width: 'auto', padding: '9px 18px' }}>
              {busy ? (editing ? t('Saving…') : t('Posting…')) : (editing ? t('Save changes') : t('Post to board'))}
            </button>
            {editing && (
              <button className="ktc-btn-secondary ktc-btn--sm" type="button" disabled={busy} onClick={() => { resetComposer(); setMsg(null) }} style={{ width: 'auto', padding: '9px 16px' }}>
                {t('Cancel edit')}
              </button>
            )}
            {msg && <span className="ktc-label" style={{ fontSize: 13, color: 'var(--acc-2)', fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>

        {/* Existing posts */}
        {activePosts.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 18, maxWidth: 600 }}>
            {activePosts.map((b, i) => {
              const scheduled = new Date(b.publish_at).getTime() > now
              const expired = b.expires_at != null && new Date(b.expires_at).getTime() <= now
              return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: b.is_published ? 'var(--c-w55)' : 'var(--c-w30)', border: '1px solid var(--glass-brd)', opacity: b.is_published ? 1 : 0.6 }}>
                {/* T3-22: reorder controls */}
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, flex: '0 0 auto' }}>
                  <button type="button" className="ktc-link" disabled={i === 0} title={t('Move up')} aria-label={t('Move up')}
                    style={{ fontSize: 11, lineHeight: 1, padding: 0, opacity: i === 0 ? 0.3 : 1, cursor: i === 0 ? 'default' : 'pointer' }}
                    onClick={() => void reorder(i, -1)}>▲</button>
                  <button type="button" className="ktc-link" disabled={i === activePosts.length - 1} title={t('Move down')} aria-label={t('Move down')}
                    style={{ fontSize: 11, lineHeight: 1, padding: 0, opacity: i === activePosts.length - 1 ? 0.3 : 1, cursor: i === activePosts.length - 1 ? 'default' : 'pointer' }}
                    onClick={() => void reorder(i, 1)}>▼</button>
                </span>
                <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.pinned && <span aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }}><PinIcon size={13} /></span>}{b.title}</span>
                  <span className="ktc-label" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {b.is_published ? t('Published') : t('Draft')}
                    {scheduled && <span className="ktc-chip" style={{ fontSize: 10 }}>{t('Scheduled')}</span>}
                    {expired && <span className="ktc-chip" style={{ fontSize: 10 }}>{t('Expired')}</span>}
                    {b.attachment_path && (
                      <button type="button" className="ktc-link" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => void openFromStorage('bulletin-files', b.attachment_path, b.attachment_name || t('Attachment'))}>
                        <PaperclipIcon size={13} /> {t('View file')}
                      </button>
                    )}
                  </span>
                </span>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => startEdit(b)}>{t('Edit')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchPost(b, { pinned: !b.pinned })}>{b.pinned ? t('Unpin') : t('Pin')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void patchPost(b, { is_published: !b.is_published })}>{b.is_published ? t('Hide') : t('Publish')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void archivePost(b)}>{t('Archive')}</button>
                <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }} onClick={() => void delPost(b)}>{t('Delete')}</button>
              </div>
              )
            })}
          </div>
        )}

        {archivedPosts.length > 0 && (
          <div style={{ marginTop: 22, maxWidth: 600 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700 }}>{t('Archive')}</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {archivedPosts.map((b) => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--c-w30)', border: '1px solid var(--glass-brd)', opacity: 0.82 }}>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
                    <span className="ktc-label" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {t('Archived')} · {b.archived_at ? new Date(b.archived_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {b.attachment_path && (
                        <button type="button" className="ktc-link" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          onClick={() => void openFromStorage('bulletin-files', b.attachment_path, b.attachment_name || t('Attachment'))}>
                          <PaperclipIcon size={13} /> {t('View file')}
                        </button>
                      )}
                    </span>
                  </span>
                  <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => startEdit(b)}>{t('Edit')}</button>
                  <button type="button" className="ktc-link" style={{ fontSize: 12 }} onClick={() => void restorePost(b)}>{t('Restore')}</button>
                  <button type="button" className="ktc-link" style={{ fontSize: 12, color: 'var(--acc-2)' }} onClick={() => void delPost(b)}>{t('Delete')}</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {viewerModal}
    </AdminShell>
  )
}
