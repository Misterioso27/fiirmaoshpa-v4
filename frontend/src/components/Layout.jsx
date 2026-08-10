import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CreditCard,
  PhoneCall, Landmark, Briefcase, Bot, BarChart3,
  Shield, Settings, LogOut, Bell, ChevronDown,
  Menu, X, User, Building2, LayoutList, Upload as UploadIcon, Megaphone
} from 'lucide-react'
import { clsx } from 'clsx'
import useAuthStore from '@/store/auth'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import CurrencyTicker from '@/components/CurrencyTicker'
import BannerCarousel from '@/components/BannerCarousel'

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard',      module: 'dashboard'   },
  { to: '/clients',     icon: Users,           label: 'Clientes',       module: 'clients',     staffOnly: true },
  { to: '/investments', icon: TrendingUp,      label: 'Inversiones',    module: 'investments' },
  { to: '/loans',       icon: CreditCard,      label: 'Préstamos',      module: 'loans'       },
  { to: '/cartera',     icon: LayoutList,      label: 'Cartera',        module: 'loans',       staffOnly: true },
  { to: '/collections', icon: PhoneCall,       label: 'Cobranza',       module: 'collections', staffOnly: true },
  { to: '/cash',        icon: Landmark,        label: 'Caja',           module: 'cash',        staffOnly: true },
  { to: '/employees',   icon: Briefcase,       label: 'Empleados',      module: 'employees',   staffOnly: true },
  { to: '/import',      icon: UploadIcon,      label: 'Importar',       module: 'loans',       staffOnly: true },
  { to: '/advertising', icon: Megaphone,       label: 'Publicidad',     module: 'advertising', staffOnly: true },
  { to: '/ai',          icon: Bot,             label: 'FIIRMAOSHPA AI', module: 'ai',          staffOnly: true },
  { to: '/reports',     icon: BarChart3,       label: 'Reportes',       module: 'reports',     staffOnly: true },
  { to: '/audit',       icon: Shield,          label: 'Auditoría',      module: 'audit',       staffOnly: true },
  { to: '/settings',    icon: Settings,        label: 'Configuración',  module: 'settings',    staffOnly: true },
]

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
        <div className="absolute right-0 top-full mt-2 rounded-xl shadow-2xl z-50 overflow-hidden border"
          style={{ background: 'var(--dark-800)', borderColor: 'var(--dark-border)', width: '17rem' }}>
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
          <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--dark-border)' }}>
            <p className="text-2xs uppercase tracking-wider font-bold mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Empresa</p>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{user?.company?.name || 'FIIRMAOSHPA'}</p>
            <p className="text-2xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{user?.branch?.name || 'Sede Principal'}</p>
          </div>
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
          <div className="p-2" style={{ borderTop: '1px solid var(--dark-border)' }}>
            <button onClick={() => { onLogout(); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <LogOut size={14} className="text-red-400" />
              <p className="text-sm font-medium text-red-400">Cerrar Sesión</p>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Sidebar({ open, onClose, bannerPosition }) {
  const { user, logout, hasPermission } = useAuthStore()
  const navigate = useNavigate()
  const isClient = user?.role?.code === 'client'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const initials = user?.full_name
    ?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 lg:hidden" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose} />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 flex flex-col z-40 transition-transform duration-300 sidebar-dark',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        style={{ width: '240px' }}
      >
        <div className="px-4 py-5" style={{ borderBottom: '1px solid var(--dark-border)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ background: 'var(--gold-dim)', border: '1px solid var(--gold-primary)', padding: '2px' }}>
                <img
                  src="https://ylodmopafxauvwurfweh.supabase.co/storage/v1/object/public/documents/Logo/a0000000-0000-4000-8000-000000000001/Gemini_Generated_Image_60043y60043y6004.png"
                  alt="FIIRMAOSHPA"
                  className="w-full h-full object-contain"
                  onError={e => { e.target.style.display='none' }}
                />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight" style={{ color: 'var(--gold-primary)' }}>FIIRMAOSHPA</p>
                <p className="text-2xs leading-tight" style={{ color: 'rgba(255,255,255,0.3)' }}>v4 Enterprise</p>
              </div>
            </div>
            <button onClick={onClose} className="lg:hidden p-1 rounded" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <X size={16} />
            </button>
          </div>
          <div className="gold-bar mt-4" style={{ opacity: 0.4 }} />
        </div>

        {/* Banner lateral — solo staff, y solo si esa es la ubicación elegida */}
        {!isClient && bannerPosition === 'sidebar' && (
          <div className="px-3 pt-3">
            <BannerCarousel position="sidebar" />
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, module, staffOnly }) => {
            if (staffOnly && isClient) return null
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

        <div className="px-3 py-4" style={{ borderTop: '1px solid var(--dark-border)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-2" style={{ background: 'var(--dark-700)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--gold-primary)', color: 'var(--dark-900)' }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'rgba(255,255,255,0.9)' }}>{user?.full_name}</p>
              <p className="text-2xs truncate" style={{ color: 'var(--gold-primary)' }}>{user?.role?.name || 'Super Admin'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="sidebar-link w-full"
            style={{ color: 'rgba(239,68,68,0.7)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; e.currentTarget.style.background = 'transparent' }}>
            <LogOut className="icon" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>
    </>
  )
}

function Header({ onMenuToggle, bannerPosition }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="fixed top-0 right-0 z-30 flex items-center justify-between px-4 md:px-6 header-dark"
      style={{ left: 'var(--sidebar-width)', height: 'var(--header-height)' }}>
      <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg transition-colors"
        style={{ color: 'rgba(255,255,255,0.6)' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--dark-700)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <Menu size={20} />
      </button>
      <div className="hidden lg:flex items-center gap-4 flex-1 min-w-0 mx-4">
        <p className="text-xs flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--dark-border)' }} />
        <CurrencyTicker />
        {bannerPosition === 'header' && (
          <div className="flex-1 min-w-0 max-w-md">
            <BannerCarousel position="header" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button className="relative p-2 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--dark-700)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Bell size={17} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2"
            style={{ background: '#EF4444', borderColor: 'var(--dark-900)' }} />
        </button>
        <div className="w-px h-5 hidden md:block" style={{ background: 'var(--dark-border)' }} />
        <ProfileDropdown user={user} onLogout={handleLogout} />
      </div>
    </header>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [bannerPosition, setBannerPosition] = useState('footer')
  const { user } = useAuthStore()
  const isClient = user?.role?.code === 'client'
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('system_config')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'banner_position')
          .maybeSingle()
        if (data?.value) setBannerPosition(data.value)
      } catch (e) { console.error(e) }
    })()
  }, [companyId])

  return (
    <div className="min-h-screen bg-hpa-slate-2">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} bannerPosition={bannerPosition} />
      <div className="transition-all duration-300 lg:ml-[240px]" style={{ paddingTop: 'var(--header-height)' }}>
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} bannerPosition={bannerPosition} />
        <main className="p-4 md:p-6 space-y-4">
          {bannerPosition === 'dashboard_top' && <BannerCarousel position="dashboard_top" />}
          <Outlet />
          {bannerPosition === 'footer' && <BannerCarousel position="footer" />}
        </main>
      </div>
    </div>
  )
}
