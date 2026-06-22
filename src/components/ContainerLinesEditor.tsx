import { useEffect, useState } from 'react'
import { SERVICE_REQUESTS } from '../lib/types'
import { useServices } from '../lib/useServices'
import { useT } from '../lib/i18n'

export interface LineDraft {
  container_number: string
  service_request: string
}

export function emptyLine(): LineDraft {
  return { container_number: '', service_request: SERVICE_REQUESTS[0] }
}

/**
 * The container rows of a job-order form (per-row service select, add/remove,
 * bulk paste). Used by both the customer form and the admin file-on-behalf
 * form — the parent owns `lines` so it can validate/submit them.
 */
export default function ContainerLinesEditor({
  lines,
  onChange,
}: {
  lines: LineDraft[]
  onChange: (lines: LineDraft[]) => void
}) {
  const { t } = useT()
  const services = useServices()
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkService, setBulkService] = useState<string>(SERVICE_REQUESTS[0])
  const [bulkNote, setBulkNote] = useState<string | null>(null)

  // When the live catalogue loads, swap stale defaults on untouched rows
  // (and the bulk default) for the first active service.
  useEffect(() => {
    if (!services.length) return
    if (!services.includes(bulkService)) setBulkService(services[0])
    if (lines.some((l) => !l.container_number.trim() && !services.includes(l.service_request))) {
      onChange(lines.map((l) =>
        !l.container_number.trim() && !services.includes(l.service_request)
          ? { ...l, service_request: services[0] }
          : l,
      ))
    }
  }, [services]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a stale (deactivated) service selectable on rows that already carry
  // it, so editing an old draft doesn't silently change the service.
  const optionsFor = (current: string) =>
    services.includes(current) || !current ? services : [current, ...services]

  function updateLine(i: number, patch: Partial<LineDraft>) {
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function addLine() {
    onChange([...lines, emptyLine()])
  }
  function removeLine(i: number) {
    if (lines.length > 1) onChange(lines.filter((_, idx) => idx !== i))
  }

  // Bulk paste: one container number per line (commas/spaces also split). Each
  // becomes a row with the chosen service; duplicates (case-insensitive) are skipped.
  function addBulk() {
    const tokens = bulkText.split(/[\s,;]+/).map((t) => t.trim().toUpperCase()).filter(Boolean)
    if (tokens.length === 0) { setBulkNote(t('Paste at least one container number first.')); return }
    const existing = new Set(lines.map((l) => l.container_number.trim().toUpperCase()).filter(Boolean))
    const added: LineDraft[] = []
    let dupes = 0
    for (const t of tokens) {
      if (existing.has(t)) { dupes++; continue }
      existing.add(t)
      added.push({ container_number: t, service_request: bulkService })
    }
    // Drop the single empty starter row if nothing's been typed into it yet.
    const base = lines.length === 1 && !lines[0].container_number.trim() ? [] : lines
    onChange([...base, ...added])
    setBulkText('')
    setBulkNote(
      dupes
        ? t('Added {n} container(s), skipped {d} duplicate(s).', { n: added.length, d: dupes })
        : t('Added {n} container(s).', { n: added.length }),
    )
  }

  // How many rows actually carry a container number (the count that gets filed).
  const filledCount = lines.filter((l) => l.container_number.trim()).length
  // Past a handful of rows, contain the list in its own scroll area so a big
  // paste (a C-entry can run 150–200 vans) doesn't bury the Add / Bulk / submit
  // controls under an endless page scroll.
  const scrolls = lines.length > 6

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span className="ktc-label">{t('Container Details')}</span>
        {filledCount > 0 && (
          <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>
            {t('{n} container(s)', { n: filledCount })}
          </span>
        )}
      </div>
      <div
        style={
          scrolls
            ? { display: 'grid', gap: 10, maxHeight: '46vh', overflowY: 'auto', paddingRight: 4, margin: '0 -2px' }
            : { display: 'grid', gap: 10 }
        }
      >
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="ktc-input ktc-mono"
            style={{ flex: '1 1 160px', textTransform: 'uppercase' }}
            placeholder={t('Container number (e.g. ABCD1234567)')}
            value={line.container_number}
            onChange={(e) => updateLine(i, { container_number: e.target.value.toUpperCase() })}
          />
          <select
            className="ktc-input"
            style={{ flex: '1 1 160px' }}
            value={line.service_request}
            onChange={(e) => updateLine(i, { service_request: e.target.value })}
          >
            {optionsFor(line.service_request).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="button"
            className="ktc-link"
            onClick={() => removeLine(i)}
            style={{ opacity: lines.length === 1 ? 0.3 : 1 }}
            aria-label={t('Remove row')}
          >
            ✕
          </button>
        </div>
      ))}
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="ktc-link" onClick={addLine}>{t('+ Add container')}</button>
        <button type="button" className="ktc-link" onClick={() => { setShowBulk((v) => !v); setBulkNote(null) }}>
          {showBulk ? t('Hide bulk paste') : t('⧉ Bulk paste')}
        </button>
      </div>

      {showBulk && (
        <div style={{ display: 'grid', gap: 10, padding: '14px 16px', borderRadius: 12, background: 'var(--c-w50)', border: '1px solid var(--glass-brd)' }}>
          <span className="ktc-label" style={{ fontSize: 12, fontWeight: 600 }}>{t('Bulk paste container numbers')}</span>
          <textarea
            className="ktc-input"
            rows={5}
            placeholder={t('One container number per line (commas or spaces also work)\n\nABCD1234567\nEFGH7654321')}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            style={{ resize: 'vertical', minHeight: 110, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="ktc-label" htmlFor="bulkSvc" style={{ fontSize: 12 }}>{t('Service for all:')}</label>
            <select id="bulkSvc" className="ktc-input" style={{ width: 'auto', minWidth: 0, flex: '0 1 auto' }} value={bulkService} onChange={(e) => setBulkService(e.target.value)}>
              {optionsFor(bulkService).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="ktc-btn" onClick={addBulk} style={{ width: 'auto', padding: '9px 18px' }}>{t('Add to list')}</button>
          </div>
          {bulkNote && <span className="ktc-label" style={{ fontSize: 12.5, color: 'var(--acc-2)', fontWeight: 600 }}>{bulkNote}</span>}
          <span className="ktc-label" style={{ fontSize: 11.5, opacity: 0.7, lineHeight: 1.5 }}>
            {t("Each line becomes a container row with the selected service — you can change any row's service afterward. Duplicates are skipped.")}
          </span>
        </div>
      )}
    </div>
  )
}
