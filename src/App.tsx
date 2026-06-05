import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Home from './pages/Home'
import JobOrder from './pages/JobOrder'
import Accreditation from './pages/Accreditation'
import MyJobOrders from './pages/MyJobOrders'

function Protected({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/job-order" element={<Protected><JobOrder /></Protected>} />
          <Route path="/accreditation" element={<Protected><Accreditation /></Protected>} />
          <Route path="/job-orders" element={<Protected><MyJobOrders /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
