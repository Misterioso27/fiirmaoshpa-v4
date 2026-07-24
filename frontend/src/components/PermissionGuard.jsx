import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import useAuthStore from '@/store/auth'

// Bloquea el acceso a una ruta si el usuario no tiene permiso de ver ese módulo.
// super_admin siempre pasa (ya resuelto dentro de hasPermission).
export default function PermissionGuard({ module, action = 'can_view', children }) {
  const { user, hasPermission } = useAuthStore()

  if (!user) return <Navigate to="/login" replace />

  if (!hasPermission(module, action)) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
        <ShieldAlert size={40} className="text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-hpa-slate-9">Acceso no autorizado</h2>
        <p className="text-sm text-hpa-slate-5 mt-1 max-w-sm">
          Tu usuario no tiene permiso para ver este módulo. Si crees que esto es un error, contacta a un administrador.
        </p>
        <a href="/dashboard" className="btn btn-primary mt-5">Volver al Dashboard</a>
      </div>
    )
  }

  return children
}
