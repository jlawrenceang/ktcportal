import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import Tour, { type TourStep } from './Tour'

// Hosts the guided Tour ABOVE the routes so it stays mounted while it navigates
// between pages. Any page/shell calls useTour().startTour(...) to launch it.

interface TourConfig { steps: TourStep[]; home?: string; label?: string; onDone?: () => void }
interface TourCtx { startTour: (c: TourConfig) => void; active: boolean }

const Ctx = createContext<TourCtx>({ startTour: () => {}, active: false })
export function useTour() { return useContext(Ctx) }

export default function TourProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TourConfig | null>(null)
  const startTour = useCallback((c: TourConfig) => setConfig(c), [])

  function end() {
    const done = config?.onDone
    setConfig(null)
    done?.()
  }

  return (
    <Ctx.Provider value={{ startTour, active: !!config }}>
      {children}
      {config && <Tour steps={config.steps} home={config.home} label={config.label} onClose={end} />}
    </Ctx.Provider>
  )
}
