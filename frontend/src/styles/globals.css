import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CreditCard,
  PhoneCall, Landmark, Briefcase, Bot, BarChart3,
  Shield, Settings, LogOut, Bell, ChevronDown,
  Menu, X, User, Building2
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

// ── Dropdown perfil ──────────────────────────────────────
function ProfileDropdown({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const initials = user?.full_name
    ?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--gold-primary)', color: 'var(--dark-900)' }}>
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-semibold leading-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
            {user?.full_name?.split(' ')[0]}
          </p>
          <p className="text-2xs leading-tight" style={{ color: 'var(--gold-primary)' }}>
            {user?.role?.name || 'Super Admin'}
          </p>
        </div>
        <ChevronDown size={13} className={`hidden md:block transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'rgba(255,255,255,0.4)' }} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-68 rounded-xl shadow-2xl z-50 overflow-hidden border"
          style={{ background: 'var(--dark-800)', borderColor: 'var(--dark-border)', width: '17rem' }}>

          {/* Header */}
          <div className="p-4" style={{ background: 'var(--dark-900)', borderBottom: '1px solid var(--dark-border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={{ background: 'var(--gold-primary)', color: 'var(--dark-900)' }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm leading-tight truncate" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  {user?.full_name}
                </p>
                <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--gold-primary)' }}>
                  {user?.role?.name || 'Super Administrador'}
                </p>
                <p className="text-2xs leading-tight truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {user?.email}
                </p>
              </div>
            </div>
          </div>

          {/* Empresa */}
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--dark-border)' }}>
            <p className="text-2xs uppercase tracking-wider font-bold mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Empresa
            </p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {user?.company?.name || 'FIIRMAOSHPA'}
            </p>
            <p className="text-2xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {user?.branch?.name || 'Sede Principal'}
            </p>
          </div>

          {/* Acciones */}
          <div className="p-2">
            {[
              { icon: User,     label: 'Mi Perfil',     sub: 'Ver perfil de empleado', to: '/employees' },
              { icon: Settings, label: 'Configuración', sub: 'Parámetros del sistema',  to: '/settings'  },
              { icon: Shield,   label: 'Auditoría',     sub: 'Historial de acciones',   to: '/audit'     },
            ].map(item => (
              <button key={item.to}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                style={{ color: 'rgba(255,255,255,0.7)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--dark-700)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => { navigate(item.to); setOpen(false) }}>
                <item.icon size={14} style={{ color: 'var(--gold-primary)' }} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{item.label}</p>
                  <p className="text-2xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Logout */}
          <div className="p-2" style={{ borderTop: '1px solid var(--dark-border)' }}>
            <button
              onClick={() => { onLogout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <LogOut size={14} className="text-red-400" />
              <p className="text-sm font-medium text-red-400">Cerrar Sesión</p>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────
function Sidebar({ open, onClose }) {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 flex flex-col z-40 transition-transform duration-300 sidebar-dark',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{ width: '240px' }}
      >
        {/* Logo */}
        <div className="px-4 py-5" style={{ borderBottom: '1px solid var(--dark-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo imagen o fallback */}
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: 'var(--gold-dim)', border: '1px solid var(--dark-border-hover)' }}>
                <Building2 size={16} style={{ color: 'var(--gold-primary)' }} />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gold-primary)' }}>
                  FIIRMAOSHPA
                </p>
                <p className="text-2xs leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  v4 Enterprise
                </p>
              </div>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 rounded"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X size={16} />
            </button>
          </div>
          <div className="gold-bar mt-4" style={{ opacity: 0.4 }} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, module }) => {
            if (module !== 'dashboard' && !hasPermission(module)) return null
            return (
              <NavLink key={to} to={to} onClick={onClose}
                className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}>
                <Icon className="icon" />
                <span>{label}</span>
              </NavLink>
            )
          })}
        </nav>

        {/* User info */}
        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--dark-border)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-2"
            style={{ background: 'var(--dark-700)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--gold-primary)', color: 'var(--dark-900)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {user?.full_name}
              </p>
              <p className="text-2xs truncate" style={{ color: 'var(--gold-primary)' }}>
                {user?.role?.name || 'Super Admin'}
              </p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="sidebar-link w-full"
            style={{ color: 'rgba(239,68,68,0.7)' }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#EF4444'
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(239,68,68,0.7)'
              e.currentTarget.style.background = 'transparent'
            }}>
            <LogOut className="icon" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Header ───────────────────────────────────────────────
function Header({ onMenuToggle }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="fixed top-0 right-0 z-30 flex items-center justify-between px-4 md:px-6 header-dark"
      style={{
        left: 'var(--sidebar-width)',
        height: 'var(--header-height)',
      }}
    >
      {/* Hamburger — mobile */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg transition-colors"
        style={{ color: 'rgba(255,255,255,0.6)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--dark-700)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Menu size={20} />
      </button>

      {/* Fecha — desktop */}
      <div className="hidden lg:block">
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Notificaciones */}
        <button className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--dark-700)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
            style={{ background: '#EF4444', borderColor: 'var(--dark-900)' }} />
        </button>

        {/* Separador */}
        <div className="w-px h-5 hidden md:block" style={{ background: 'var(--dark-border)' }} />

        {/* Perfil */}
        <ProfileDropdown user={user} onLogout={handleLogout} />
      </div>
    </header>
  )
}

// ── Layout principal ─────────────────────────────────────
export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-hpa-slate-2">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div
        className="transition-all duration-300 lg:ml-[240px]"
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
