import { useEffect, useState } from 'react'

// True on phone-width viewports. Drives the responsive split between the
// desktop layout and the compact / wizard mobile layout. Matches the CSS
// mobile layer breakpoint (640px) so JS and CSS agree.
export function useIsMobile(query = '(max-width: 640px)'): boolean {
  const [match, setMatch] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}
