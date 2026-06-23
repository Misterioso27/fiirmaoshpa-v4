import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CreditCard,
  PhoneCall, Landmark, Briefcase, Bot, BarChart3,
  Shield, Settings, LogOut, Bell, ChevronDown, Building2
} from 'lucide-react'
import { clsx } from 'clsx'
import useAuthStore from '@/store/auth'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',    module: 'dashboard' },
  { to: '/clients',     icon: Users,           label: 'Clientes',     module: 'clients' },
  { to: '/investments', icon: TrendingUp,      label: 'Inversiones',  module: 'investments' },
  { to: '/loans',       icon: CreditCard,      label: 'Préstamos',    module: 'loans' },
  { to: '/collections', icon: PhoneCall,       label: 'Cobranza',     module: 'collections' },
  { to: '/cash',        icon: Landmark,        label: 'Caja',         module: 'cash' },
  { to: '/employees',   icon: Briefcase,       label: 'Empleados',    module: 'employees' },
  { to: '/ai',          icon: Bot,             label: 'FIIRMAOSHPA AI', module: 'ai' },
  { to: '/reports',     icon: BarChart3,       label: 'Reportes',     module: 'reports' },
  { to: '/audit',       icon: Shield,          label: 'Auditoría',    module: 'audit' },
  { to: '/settings',    icon: Settings,        label: 'Configuración', module: 'config' },
]

function Sidebar() {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="fixed inset-y-0 left-0 w-[var(--sidebar-width)] gradient-hpa flex flex-col z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-hpa-gold flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-hpa-900" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">FIIRMAOSHPA</p>
            <p className="text-white/40 text-2xs leading-tight">v4 Enterprise</p>
          </div>
        </div>
        <div className="gold-bar mt-4 opacity-40" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label, module }) => {
          if (module !== 'dashboard' && !hasPermission(module)) return null
          return (
            <NavLink key={to} to={to}
              className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
              <Icon className="icon" />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-hpa-gold flex items-center justify-center text-hpa-900 text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user?.full_name}</p>
            <p className="text-white/40 text-2xs truncate">{user?.role?.name}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="sidebar-link w-full mt-1 text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <LogOut className="icon" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}

function Header({ title }) {
  const { user } = useAuthStore()
  return (
    <header className="fixed top-0 right-0 h-[var(--header-height)] bg-white border-b border-hpa-slate-3 z-30 flex items-center justify-between px-6"
      style={{ left: 'var(--sidebar-width)' }}>
      <h1 className="text-base font-semibold text-hpa-slate-9">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="btn-icon btn-ghost relative">
          <Bell size={16} className="text-hpa-slate-6" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-hpa-red rounded-full" />
        </button>
        <div className="flex items-center gap-2 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-hpa-700 flex items-center justify-center text-white text-xs font-bold">
            {user?.full_name?.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-hpa-slate-8">{user?.full_name?.split(' ')[0]}</span>
          <ChevronDown size={14} className="text-hpa-slate-5" />
        </div>
      </div>
    </header>
  )
}

export default function Layout() {
  return (
    <div className="min-h-screen bg-hpa-slate-2">
      <Sidebar />
      <div style={{ marginLeft: 'var(--sidebar-width)', paddingTop: 'var(--header-height)' }}>
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
