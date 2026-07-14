import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CreditCard,
  PhoneCall, Landmark, Briefcase, Bot, BarChart3,
  Shield, Settings, LogOut, Bell, ChevronDown,
  Building2, Menu, X, User, KeyRound
} from 'lucide-react'
import { clsx } from 'clsx'
import useAuthStore from '@/store/auth'
import { useState, useRef, useEffect } from 'react'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',      module: 'dashboard'   },
  { to: '/clients',     icon: Users,           label: 'Clientes',       module: 'clients'     },
  { to: '/investments', icon: TrendingUp,      label: 'Inversiones',    module: 'investments' },
  { to: '/loans',       icon: CreditCard,      label: 'Préstamos',      module: 'loans'       },
  { to: '/collections', icon: PhoneCall,       label: 'Cobranza',       module: 'collections' },
  { to: '/cash',        icon: Landmark,        label: 'Caja',           module: 'cash'        },
  { to: '/employees',   icon: Briefcase,       label: 'Empleados',      module: 'employees'   },
  { to: '/ai',          icon: Bot,             label: 'FIIRMAOSHPA AI', module: 'ai'          },
  { to: '/reports',     icon: BarChart3,       label: 'Reportes',       module: 'reports'     },
  { to: '/audit',       icon: Shield,          label: 'Auditoría',      module: 'audit'       },
  { to: '/settings',    icon: Settings,        label: 'Configuración',  module: 'config'      },
]

// ── Dropdown perfil ───────────────────────────────────────
function ProfileDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const initials = user?.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-hpa-slate-2 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-hpa-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-semibold text-hpa-slate-9 leading-tight">{user?.full_name?.split(' ')[0]}</p>
          <p className="text-2xs text-hpa-slate-5 leading-tight">{user?.role?.name || 'Usuario'}</p>
        </div>
        <ChevronDown size={14} className={`text-hpa-slate-5 transition-transform hidden md:block ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-hpa-slate-2 z-50 overflow-hidden">
          {/* Header del perfil */}
          <div className="p-4 bg-gradient-to-r from-hpa-900 to-hpa-700">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-hpa-gold flex items-center justify-center text-hpa-900 font-bold text-sm flex-shrink-0">
                {initials}
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{user?.full_name}</p>
                <p className="text-white/60 text-xs leading-tight mt-0.5">{user?.role?.name || 'Usuario'}</p>
                <p className="text-white/40 text-2xs leading-tight">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Info empresa */}
          <div className="px-4 py-2.5 border-b border-hpa-slate-2 bg-hpa-slate-1">
            <p className="text-2xs text-hpa-slate-5 uppercase tracking-wider font-bold mb-1">Empresa</p>
            <p className="text-xs font-semibold text-hpa-slate-9">{user?.company?.name || 'FIIRMAOSHPA'}</p>
            <p className="text-2xs text-hpa-slate-5">{user?.branch?.name || 'Sede Principal'}</p>
          </div>

          {/* Acciones */}
          <div className="p-2">
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hpa-slate-1 transition-colors text-left"
              onClick={() => { navigate('/settings'); setOpen(false) }}
            >
              <Settings size={15} className="text-hpa-slate-5" />
              <div>
                <p className="text-sm font-medium text-hpa-slate-8">Configuración</p>
                <p className="text-2xs text-hpa-slate-4">Parámetros del sistema</p>
              </div>
            </button>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hpa-slate-1 transition-colors text-left"
              onClick={() => { navigate('/employees'); setOpen(false) }}
            >
              <User size={15} className="text-hpa-slate-5" />
              <div>
                <p className="text-sm font-medium text-hpa-slate-8">Mi Perfil</p>
                <p className="text-2xs text-hpa-slate-4">Ver perfil de empleado</p>
              </div>
            </button>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hpa-slate-1 transition-colors text-left"
              onClick={() => { navigate('/audit'); setOpen(false) }}
            >
              <Shield size={15} className="text-hpa-slate-5" />
              <div>
                <p className="text-sm font-medium text-hpa-slate-8">Auditoría</p>
                <p className="text-2xs text-hpa-slate-4">Historial de operaciones</p>
              </div>
            </button>
          </div>

          {/* Logout */}
          <div className="p-2 border-t border-hpa-slate-2">
            <button
              onClick={() => { onLogout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors text-left"
            >
              <LogOut size={15} className="text-red-500" />
              <p className="text-sm font-medium text-red-600">Cerrar Sesión</p>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────
function Sidebar({ open, onClose }) {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initials = user?.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 w-[var(--sidebar-width)] gradient-hpa flex flex-col z-40 transition-transform duration-300',
        'lg:translate-x-0',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-hpa-gold flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-hpa-900" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">FIIRMAOSHPA</p>
                <p className="text-white/40 text-2xs leading-tight">v4 Enterprise</p>
              </div>
            </div>
            {/* Botón cerrar en mobile */}
            <button
              onClick={onClose}
              className="lg:hidden text-white/60 hover:text-white p-1"
            >
              <X size={18} />
            </button>
          </div>
          <div className="gold-bar mt-4 opacity-40" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, module }) => {
            if (module !== 'dashboard' && !hasPermission(module)) return null
            return (
              <NavLink key={to} to={to}
                onClick={onClose}
                className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
                <Icon className="icon" />
                <span>{label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* User info en sidebar */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5 mb-2">
            <div className="w-8 h-8 rounded-full bg-hpa-gold flex items-center justify-center text-hpa-900 text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.full_name}</p>
              <p className="text-white/50 text-2xs truncate">{user?.role?.name || 'Super Admin'}</p>
              <p className="text-white/30 text-2xs truncate">{user?.branch?.name || 'Sede Principal'}</p>
            </div>
          </div>
          <NavLink to="/settings" onClick={onClose} className="sidebar-link">
            <Settings className="icon" />
            <span>Configuración</span>
          </NavLink>
          <button onClick={handleLogout}
            className="sidebar-link w-full mt-0.5 text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut className="icon" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Header ────────────────────────────────────────────────
function Header({ onMenuToggle }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="fixed top-0 right-0 h-[var(--header-height)] bg-white border-b border-hpa-slate-3 z-30 flex items-center justify-between px-4 md:px-6"
      style={{ left: 'var(--sidebar-width)' }}
    >
      {/* Hamburger — solo mobile */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg hover:bg-hpa-slate-1 text-hpa-slate-6"
      >
        <Menu size={20} />
      </button>

      {/* Título — solo desktop (mobile usa sidebar) */}
      <div className="hidden lg:block">
        <p className="text-xs text-hpa-slate-5">
          {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Notificaciones */}
        <button className="relative p-2 rounded-lg hover:bg-hpa-slate-1 text-hpa-slate-6 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        {/* Perfil dropdown */}
        <ProfileDropdown user={user} onLogout={handleLogout} />
      </div>
    </header>
  )
}

// ── Layout principal ──────────────────────────────────────
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-hpa-slate-2">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* En mobile el sidebar se superpone, no empuja el contenido */}
      <div
        className="lg:ml-[var(--sidebar-width)] transition-all duration-300"
        style={{ paddingTop: 'var(--header-height)' }}
      >
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
