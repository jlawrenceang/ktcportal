import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import { TrashIcon } from './icons'

/**
 * One-line integration for pages that view stored attachments:
 *   const { openFromStorage, viewerModal } = useFileViewer(setError)
 *   ... onClick={() => void openFromStorage('valid-ids', path, 'Valid ID — Juan')}
 *   ... {viewerModal}
 *
 * Pass { onDeleted } as the 4th arg to also offer a 🗑 Delete action in the
 * viewer (removes the file from storage, then lets the caller clear its
 * DB reference) — used for valid-ID cleanup after printing/review.
 */
export function useFileViewer(onError: (msg: string) => void) {
  const { t } = useT()
  const [viewer, setViewer] = useState<{
    title: string
    fileName: string
    url: string
    bucket: string
    path: string
    onDeleted?: () => void | Promise<void>
  } | null>(null)

  async function openFromStorage(
    bucket: string,
    path: string | null | undefined,
    title: string,
    opts?: { onDeleted?: () => void | Promise<void> },
  ) {
    if (!path) return
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
    if (error || !data) return onError(error?.message ?? t('Could not open the file.'))
    setViewer({ title, fileName: path.split('/').pop() ?? 'attachment', url: data.signedUrl, bucket, path, onDeleted: opts?.onDeleted })
  }

  const viewerModal = viewer ? (
    <FileViewerModal
      title={viewer.title}
      fileName={viewer.fileName}
      url={viewer.url}
      onClose={() => setViewer(null)}
      onDelete={
        viewer.onDeleted
          ? async () => {
              const { error } = await supabase.storage.from(viewer.bucket).remove([viewer.path])
              if (error) { onError(error.message); return false }
              await viewer.onDeleted?.()
              setViewer(null)
              return true
            }
          : undefined
      }
    />
  ) : null

  return { openFromStorage, viewerModal }
}

// In-app viewer for uploaded attachments (valid IDs, payment slips, 2303 docs).
// Replaces "open signed URL in a new tab": shows the image/PDF in a modal with
// Print + Save actions (+ optional Delete). The file is fetched into a blob
// immediately, so the short-lived signed URL can't expire while the admin is
// looking at it.
export default function FileViewerModal({
  title,
  fileName,
  url,
  onClose,
  onDelete,
}: {
  title: string
  fileName: string
  url: string // signed URL (fetched once, then viewed as a local blob)
  onClose: () => void
  onDelete?: () => Promise<boolean> // returns false if the delete failed
}) {
  const { t } = useT()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [kind, setKind] = useState<'image' | 'pdf' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const printFrameRef = useRef<HTMLIFrameElement>(null)
  const pdfFrameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let active = true
    void (async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`fetch failed (${res.status})`)
        const blob = await res.blob()
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        // Trust the MIME type, but fall back to the file extension — some storage
        // configs hand a PDF back as application/octet-stream, which would
        // otherwise render (and try to print) as a broken image.
        const isPdf = blob.type === 'application/pdf' || /\.pdf$/i.test(fileName)
        setKind(isPdf ? 'pdf' : 'image')
        setBlobUrl(objectUrl)
      } catch {
        if (active) setError(t('Could not load the file. Please try again.'))
      }
    })()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function save() {
    if (!blobUrl) return
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName
    a.click()
  }

  function print() {
    if (!blobUrl) return
    if (kind === 'pdf') {
      // The displayed iframe holds a same-origin blob URL — print it directly.
      pdfFrameRef.current?.contentWindow?.print()
      return
    }
    // Images: stage a minimal document in the hidden print iframe. The print is
    // triggered via a DOM onload handler set from here (this file's 'self'
    // script) — NOT an inline onload attribute, which the CSP (script-src 'self',
    // no unsafe-inline) blocks, which is what stopped printing entirely.
    const frame = printFrameRef.current
    const win = frame?.contentWindow
    const doc = frame?.contentDocument
    if (!frame || !win || !doc) return
    doc.open()
    doc.write('<!doctype html><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center}img{max-width:100%;max-height:100vh}</style>')
    doc.title = title
    doc.close()
    const img = doc.createElement('img')
    img.onload = () => { win.focus(); win.print() }
    img.src = blobUrl
    doc.body.appendChild(img)
  }

  async function doDelete() {
    if (!onDelete || deleting) return
    setDeleting(true)
    const ok = await onDelete()
    setDeleting(false)
    if (!ok) setConfirmDel(false) // error surfaced by the caller; keep viewing
  }

  return (
    <div className="ktc-modal-backdrop" onClick={onClose}>
      <div
        className="ktc-glass-thick ktc-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: 720, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--glass-brd)' }}>
          <span style={{ fontWeight: 650, fontSize: 14.5, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
          {onDelete && (
            confirmDel ? (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, color: 'var(--acc-2)', whiteSpace: 'nowrap' }}>{t('Delete permanently?')}</span>
                <button type="button" className="ktc-link" style={{ fontWeight: 700, color: 'var(--acc-2)' }} disabled={deleting} onClick={() => void doDelete()}>
                  {deleting ? t('Deleting…') : t('Yes')}
                </button>
                <button type="button" className="ktc-link" onClick={() => setConfirmDel(false)}>{t('No')}</button>
              </span>
            ) : (
              <button type="button" className="ktc-btn-secondary ktc-btn--sm" style={{ color: 'var(--acc-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setConfirmDel(true)}
                title={t('Permanently delete this file from storage (DPA cleanup)')}>
                <TrashIcon size={15} /> {t('Delete')}
              </button>
            )
          )}
          <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={print} disabled={!blobUrl}>
            {t('Print')}
          </button>
          <button type="button" className="ktc-btn-secondary ktc-btn--sm" onClick={save} disabled={!blobUrl}>
            {t('Save')}
          </button>
          <button
            type="button"
            aria-label={t('Close')}
            onClick={onClose}
            style={{ fontSize: 19, lineHeight: 1, border: 0, background: 'none', cursor: 'pointer', color: 'hsl(var(--ink-2))', padding: '2px 6px' }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 240, overflow: 'auto', display: 'grid', placeItems: 'center', background: 'var(--c-w35)', padding: kind === 'pdf' ? 0 : 16 }}>
          {error ? (
            <span style={{ fontSize: 13.5, color: 'var(--acc-2)', fontWeight: 500 }}>{error}</span>
          ) : !blobUrl ? (
            <div className="ktc-skeleton" style={{ width: '70%', height: 220 }} />
          ) : kind === 'pdf' ? (
            <iframe ref={pdfFrameRef} src={blobUrl} title={title} style={{ width: '100%', height: '70vh', border: 0 }} />
          ) : (
            <img src={blobUrl} alt={title} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 10, boxShadow: 'var(--shadow-md)' }} />
          )}
        </div>
      </div>

      {/* Hidden staging frame for printing images */}
      <iframe ref={printFrameRef} title="print" style={{ position: 'fixed', width: 0, height: 0, border: 0, visibility: 'hidden' }} />
    </div>
  )
}
