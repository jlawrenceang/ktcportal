// "Still there?" prompt shown ~1 minute before the idle auto-sign-out.
// There is intentionally no onClick handler: ANY click, keypress or mouse
// movement — including pressing this button — bubbles to the window-level
// activity listeners in useIdleLogout, which reset the timer and clear the
// warning. The button just gives the user an obvious thing to click.
export default function IdleWarning() {
  return (
    <div className="ktc-modal-backdrop" role="alertdialog" aria-live="assertive" aria-label="Inactivity warning">
      <div className="ktc-glass-thick ktc-modal-panel" style={{ maxWidth: 400, padding: '26px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 30, lineHeight: 1 }} aria-hidden>⏰</div>
        <b style={{ display: 'block', margin: '10px 0 4px', fontSize: 16 }}>Are you still there?</b>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, opacity: 0.85 }}>
          You&rsquo;ve been inactive for a while — you&rsquo;ll be signed out in about a minute.
        </p>
        <button className="ktc-btn">I&rsquo;m still here — keep me signed in</button>
      </div>
    </div>
  )
}
