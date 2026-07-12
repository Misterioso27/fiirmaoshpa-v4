import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import useAuthStore from '@/store/auth'
import Layout     from '@/components/Layout'
import Login      from '@/pages/Login'
import Dashboard  from '@/pages/Dashboard'
import Clients    from '@/pages/Clients'
import Investments from '@/pages/Investments'
import Loans      from '@/pages/Loans'
import Collections from '@/pages/Collections'
import Cash       from '@/pages/Cash'
import Employees  from '@/pages/Employees'
import AIAgents   from '@/pages/AIAgents'
import Reports    from '@/pages/Reports'
import Audit      from '@/pages/Audit'
import Settings   from '@/pages/Settings'
import Simulator  from '@/pages/Simulator'

function Guard({ children }) {
  const { user } = useAuthStore()
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Rutas públicas — sin login ──────────────────── */}
        <Route path="/login"     element={<Login />} />
        <Route path="/simulator" element={<Simulator />} />

        {/*
