import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Tour, { type TourStep } from './Tour'
import { useAuth } from '../lib/AuthContext'
import { useBroker } from '../lib/useBroker'
import { useT } from '../lib/i18n'
import { pageTourShownThisSession, markPageTourSeen } from '../lib/tourSeen'

// Hosts the Tour ABOVE the routes so it survives navigation. Pages register
// their own short tour via usePageTour — it auto-opens the first time the
// account lands on that page, and the help (?) icon replays the current page's.

interface TourConfig { steps: TourStep[]; home?: string; label?: string; onDone?: () => void }
interface TourCtx {
  startTour: (c: TourConfig) => void
  active: boolean
  registerPageTour: (key: string | null, steps: TourStep[], onDone?: () => void) => void
  replayPageTour: () => void
  hasPageTour: boolean
}

const Ctx = createContext<TourCtx>({
  startTour: () => {}, active: false, registerPageTour: () => {}, replayPageTour: () => {}, hasPageTour: false,
})
export function useTour() { return useContext(Ctx) }

export default function TourProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [config, setConfig] = useState<TourConfig | null>(null)
  const pageTourRef = useRef<{ key: string; steps: TourStep[]; onDone?: () => void } | null>(null)
  const [hasPageTour, setHasPageTour] = useState(false)

  // A tour is only ever for a signed-in portal user. The moment the session
  // ends (sign-out, single-session eviction, or the /confirmed page signing the
  // user back out after email verification), drop any active tour — otherwise
  // its overlay lingers on top of the login page, since TourProvider sits ABOVE
  // the routes and survives the route change a normal page would not.
  useEffect(() => {
    if (!session) setConfig(null)
  }, [session])

  const startTour = useCallback((c: TourConfig) => setConfig(c), [])
  const registerPageTour = useCallback((key: string | null, steps: TourStep[], onDone?: () => void) => {
    pageTourRef.current = key ? { key, steps, onDone } : null
    setHasPageTour(!!key)
  }, [])
  const replayPageTour = useCallback(() => {
    if (pageTourRef.current) setConfig({ steps: pageTourRef.current.steps, onDone: pageTourRef.current.onDone })
  }, [])

  function end() {
    const done = config?.onDone
    setConfig(null)
    done?.()
  }

  return (
    <Ctx.Provider value={{ startTour, active: !!config, registerPageTour, replayPageTour, hasPageTour }}>
      {children}
      {config && session && <Tour steps={config.steps} home={config.home} label={config.label} onClose={end} />}
    </Ctx.Provider>
  )
}

// Each page calls this with a STABLE key + steps (define steps as a module
// const). First visit (per account, per session) auto-opens; the page tour is
// registered so the help (?) icon can replay it on demand.
export function usePageTour(key: string, steps: TourStep[], onDone?: () => void) {
  const { broker } = useBroker()
  const { setupDone } = useT()
  const { startTour, active, registerPageTour } = useTour()
  useEffect(() => {
    registerPageTour(key, steps, onDone)
    return () => registerPageTour(null, [])
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!broker || steps.length === 0) return
    // Wait for first-run setup (language + notifications) to finish — the demo
    // runs in the chosen language and never stacks on the setup modal.
    if (!setupDone) return
    const seen = (broker.tours_seen ?? []).includes(key)
    if (seen || pageTourShownThisSession(key) || active) return
    markPageTourSeen(key)
    startTour({ steps, onDone })
  }, [broker, setupDone]) // eslint-disable-line react-hooks/exhaustive-deps
}
