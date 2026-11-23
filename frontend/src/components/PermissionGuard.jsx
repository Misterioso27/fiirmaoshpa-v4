import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import useAuthStore from '@/store/auth'

export default function PermissionGuard({ module, action = 'view', children }) {
  const { user, hasPermission } = useAuthStore()
  const navigate = useNavigate()

  const roleCode = user?.role?.code || user?.role_code || ''
  const isClient = roleCode === 'client'

  // Si es cliente y entra a publicidad, le permitimos ver/solicitar su anuncio
  if (isClient && module === 'advertising') {
    return children
  }

  const allowed =
    typeof hasPermission === 'function'
      ? hasPermission(module, action) || hasPermission(module)
      : true

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-7 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900">Acceso no autorizado</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tu usuario no tiene permiso para ver este módulo. Si crees que esto es un error, contacta a un administrador.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded-lg bg-[#0f294a] text-white text-xs font-semibold hover:bg-[#173b6c] transition cursor-pointer"
          >
            Volver al Dashboard
          </button>
        </div>
      </div>
    )
  }

  return children
}
