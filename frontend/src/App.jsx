import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '@/store/auth'
import Layout           from '@/components/Layout'
import PermissionGuard   from '@/components/PermissionGuard'
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
import Cartera     from '@/pages/Cartera'
import Import      from '@/pages/Import'
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
          <Route path="dashboard"   element={<PermissionGuard module="dashboard"><Dashboard /></PermissionGuard>} />
          <Route path="clients"     element={<PermissionGuard module="clients"><Clients /></PermissionGuard>} />
          <Route path="investments" element={<PermissionGuard module="investments"><Investments /></PermissionGuard>} />
          <Route path="loans"       element={<PermissionGuard module="loans"><Loans /></PermissionGuard>} />
          <Route path="collections" element={<PermissionGuard module="collections"><Collections /></PermissionGuard>} />
          <Route path="cash"        element={<PermissionGuard module="cash"><Cash /></PermissionGuard>} />
          <Route path="employees"   element={<PermissionGuard module="employees"><Employees /></PermissionGuard>} />
          <Route path="ai"          element={<PermissionGuard module="ai"><AIAgents /></PermissionGuard>} />
          <Route path="reports"     element={<PermissionGuard module="reports"><Reports /></PermissionGuard>} />
          <Route path="audit"       element={<PermissionGuard module="audit"><Audit /></PermissionGuard>} />
          <Route path="settings"    element={<PermissionGuard module="settings"><Settings /></PermissionGuard>} />
          <Route path="cartera"     element={<PermissionGuard module="cartera"><Cartera /></PermissionGuard>} />
          <Route path="import"      element={<PermissionGuard module="import"><Import /></PermissionGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
