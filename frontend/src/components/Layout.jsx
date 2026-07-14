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
    document.addEventListener('mousedown',
