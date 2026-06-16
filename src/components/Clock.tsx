import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'

// Live date + time for the top app bar (fills the empty middle of the rail).
// Uses the browser's local timezone — for KTC users that's Philippine time.
export default function Clock() {
  const { lang } = useT()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  const locale = lang === 'tl' ? 'fil-PH' : 'en-PH'
  const date = now.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = now.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })

  return (
    <div className="ktc-nav-clock" aria-label={`${date} ${time}`}>
      <span className="ktc-nav-clock-time">{time}</span>
      <span className="ktc-nav-clock-date">{date}</span>
    </div>
  )
}
