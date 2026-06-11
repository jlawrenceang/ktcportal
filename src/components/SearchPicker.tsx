import { useEffect, useState } from 'react'

export interface PickerItem {
  id: string
  /** Bold lead text (e.g. consignee code, customer code). */
  title: string
  /** Rest of the row (name, email…). */
  sub?: string
}

/**
 * Debounced server-side typeahead over a large table (consignees, customers —
 * both past the 1000-row select cap, so we query as the user types).
 * The parent owns the selection; `search` must be a stable function
 * (module-level) or the effect re-fires every render.
 */
export default function SearchPicker({
  inputId,
  placeholder,
  selected,
  onSelect,
  search,
  minChars = 2,
}: {
  inputId: string
  placeholder: string
  selected: PickerItem | null
  onSelect: (item: PickerItem | null) => void
  search: (q: string) => Promise<PickerItem[]>
  minChars?: number
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerItem[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (selected) return
    const q = query.trim()
    if (q.length < minChars) {
      setResults([])
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      setResults(await search(q))
      setSearching(false)
    }, 250)
    return () => clearTimeout(handle)
  }, [query, selected, search, minChars])

  function pick(item: PickerItem) {
    onSelect(item)
    setQuery(item.sub ? `${item.title} – ${item.sub}` : item.title)
    setOpen(false)
  }
  function clear() {
    onSelect(null)
    setQuery('')
    setResults([])
    setOpen(true)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        id={inputId}
        className="ktc-input"
        placeholder={placeholder}
        value={query}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          onSelect(null)
          setOpen(true)
        }}
        onFocus={() => {
          if (!selected) setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {selected && (
        <button
          type="button"
          className="ktc-link"
          onClick={clear}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}
        >
          Change
        </button>
      )}
      {open && !selected && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: 'auto',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(20px) saturate(1.6)',
            border: '1px solid var(--glass-brd)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
            padding: 6,
          }}
        >
          {searching ? (
            <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>Searching…</div>
          ) : query.trim().length < minChars ? (
            <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>
              Type at least {minChars} characters to search.
            </div>
          ) : results.length === 0 ? (
            <div className="ktc-label" style={{ padding: '8px 10px', fontSize: 13 }}>No matches.</div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                // onMouseDown (not onClick) so selection fires before the input blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(item)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <b>{item.title}</b>
                {item.sub ? <> – {item.sub}</> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
