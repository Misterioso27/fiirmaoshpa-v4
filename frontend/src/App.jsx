import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '@/store/auth'
import Layout           from '@/components/Layout'
import PermissionGuard   from '@/components/PermissionGuard'
import Login       from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
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
import Cartera     from '@/pages/Cartera'
import Import      from '@/pages/Import'
import Advertising from '@/pages/Advertising'
function Guard({ children }) {
  const { user } = useAuthStore()
  return user ? children : <Navigate to="/login" replace />
}
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/simulator"      element={<Simulator />} />
        <Route path="/" element={<Guard><Layout /></Guard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<PermissionGuard module="dashboard"><Dashboard /></PermissionGuard>} />
          <Route path="clients"     element={<PermissionGuard module="clients" staffOnly><Clients /></PermissionGuard>} />
          <Route path="investments" element={<PermissionGuard module="investments"><Investments /></PermissionGuard>} />
          <Route path="loans"       element={<PermissionGuard module="loans"><Loans /></PermissionGuard>} />
          <Route path="collections" element={<PermissionGuard module="collections" staffOnly><Collections /></PermissionGuard>} />
          <Route path="cash"        element={<PermissionGuard module="cash" staffOnly><Cash /></PermissionGuard>} />
          <Route path="employees"   element={<PermissionGuard module="employees" staffOnly><Employees /></PermissionGuard>} />
          <Route path="ai"          element={<PermissionGuard module="ai" staffOnly><AIAgents /></PermissionGuard>} />
          <Route path="reports"     element={<PermissionGuard module="reports" staffOnly><Reports /></PermissionGuard>} />
          <Route path="audit"       element={<PermissionGuard module="audit" staffOnly><Audit /></PermissionGuard>} />
          <Route path="settings"    element={<PermissionGuard module="settings" staffOnly><Settings /></PermissionGuard>} />
          <Route path="cartera"     element={<PermissionGuard module="cartera" staffOnly><Cartera /></PermissionGuard>} />
          <Route path="import"      element={<PermissionGuard module="import" staffOnly><Import /></PermissionGuard>} />
          <Route path="advertising" element={<PermissionGuard module="advertising" staffOnly><Advertising /></PermissionGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
