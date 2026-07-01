export function formatEntryNumberInput(raw: string): string {
  const compact = raw.toUpperCase().replace(/\s+/g, '')
  if (!compact) return ''
  if (compact === 'C' || compact === 'C-') return 'C-'
  if (compact.startsWith('C-')) return compact
  if (compact.startsWith('C')) return `C-${compact.slice(1).replace(/^-+/, '')}`
  return `C-${compact.replace(/^-+/, '')}`
}

export function normalizeEntryNumber(raw: string): string {
  return formatEntryNumberInput(raw).replace(/-+$/, '')
}

export function isCompleteEntryNumber(raw: string): boolean {
  return /^C-[A-Z0-9][A-Z0-9-]*$/.test(normalizeEntryNumber(raw))
}
