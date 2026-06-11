import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/v2-tokens.css'
import './index.css'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installErrorReporting } from './lib/errorReporting'

installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
