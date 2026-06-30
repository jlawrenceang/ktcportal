import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/v2-tokens.css'
import './styles/theme-colors.css'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorReporting } from './lib/errorReporting'
import { registerSW } from './lib/registerSW'
import { installNativeDeviceHooks } from './lib/nativeDevice'
import { installNativePushHandlers } from './lib/push'
import { installNativeUpdaterReadySignal } from './lib/nativeUpdater'

installNativeUpdaterReadySignal()
installErrorReporting()
registerSW()
installNativeDeviceHooks()
installNativePushHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
