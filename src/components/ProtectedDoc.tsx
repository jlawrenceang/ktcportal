import { useEffect, type ReactNode } from 'react'
import { useT } from '../lib/i18n'

// Wraps a confidential, view-only document (Customer Guide, Customer Agreement).
// Deters copying/printing/saving: disables text selection + right-click, blocks
// Ctrl/Cmd+P and Ctrl/Cmd+S, and blanks the content for the print stylesheet
// (showing a confidentiality notice instead).
//
// NOTE: this is a DETERRENT, not absolute protection — a determined user can
// still screenshot or photograph the screen. It stops casual print/save/copy.
export default function ProtectedDoc({ children }: { children: ReactNode }) {
  const { t } = useT()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (k === 'p' || k === 's')) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <>
      <div className="ktc-protected-doc" onContextMenu={(e) => e.preventDefault()} onCopy={(e) => e.preventDefault()}>
        <div className="ktc-confidential-badge">
          🔒 {t('Confidential — for viewing only. Printing, saving and copying are disabled.')}
        </div>
        {children}
      </div>
      {/* Shown only by the print stylesheet, in place of the blanked content. */}
      <div className="ktc-print-only ktc-confidential-print">
        {t('This document is confidential and may not be printed, saved, or reproduced.')}
      </div>
    </>
  )
}
