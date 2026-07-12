import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '@/store/auth'
import Layout      from '@/components/Layout'
import Login       from '@/pages/Login'
import Dashboard   from '@/pages/Dashboard'
import Clients     from '@/pages/Clients'
import Investments from '@/pages/Investments'
import Loans       from '@/pages/Loans'
import Collections from '@/pages/Collections'
import Cash        from '@/pages/Cash'
import Employees   from '@/pages/Employees'
import AIAgents    from '@/pages/AIAgents'
import Reports     from '@/pages/Reports'
import Audit       from '@/pages/Audit'
import Settings    from '@/pages/Settings'
import Simulator   from '@/pages/Simulator'

function Guard({ children }) {
  const { user } = useAuthStore()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"     element={<Login />} />
        <Route path="/simulator" element={<Simulator />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<Dashboard />} />
          <Route path="clients"     element={<Clients />} />
          <Route path="investments" element={<Investments />} />
          <Route path="loans"       element={<Loans />} />
          <Route path="collections" element={<Collections />} />
          <Route path="cash"        element={<Cash />} />
          <Route path="employees"   element={<Employees />} />
          <Route path="ai"          element={<AIAgents />} />
          <Route path="reports"     element={<Reports />} />
          <Route path="audit"       element={<Audit />} />
          <Route path="settings"    element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
