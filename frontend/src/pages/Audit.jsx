import { useState, useEffect, useCallback } from 'react'
import { Shield, Search, Download } from 'lucide-react'
import { db, fmtDateTime } from '@/lib/supabase'
import { Pagination, Empty, Spinner } from '@/components/ui'

export default function Audit() {
  const [logs, setLogs]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]     = useState(1)
  const [pagination, setPagination] = useState({})
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 25 })
      if (module) params.set('module', module)
      if (action) params.set('action', action)
      const data = await api.get(`/audit?${params}`)
      setLogs(data.logs || [])
      setPagination(data.pagination || {})
    } catch {}
    setLoading(false)
  }, [page, module, action])

  useEffect(() => { load() }, [load])

  const actionColor = { CREATE: 'badge-green', UPDATE: 'badge-blue', DELETE: 'badge-red', LOGIN: 'badge-amber', LOGOUT: 'badge-gray' }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Auditoría</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Log inmutable de todas las acciones del sistema</p>
        </div>
        <button className="btn btn-ghost" onClick={() => api.get('/audit/export')}>
          <Download size={15} /> Exportar
        </button>
      </div>

      <div className="card p-4 flex gap-3">
        <select className="select w-44" value={module} onChange={e => { setModule(e.target.value); setPage(1) }}>
          <option value="">Todos los módulos</option>
          {['auth','clients','loans','investments','collections','cash','employees','ai'].map(m=><option key={m}>{m}</option>)}
        </select>
        <select className="select w-36" value={action} onChange={e => { setAction(e.target.value); setPage(1) }}>
          <option value="">Todas las acciones</option>
          {['CREATE','UPDATE','DELETE','LOGIN','LOGOUT'].map(a=><option key={a}>{a}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha/Hora</th><th>Actor</th><th>Rol</th>
                <th>Acción</th><th>Módulo</th><th>Registro</th><th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7}>
                  <Empty icon={Shield} title="Sin registros" desc="No hay eventos de auditoría con estos filtros" />
                </td></tr>
              ) : logs.map(log => (
                <tr key={log.id}>
                  <td className="text-xs font-mono text-hpa-slate-6 whitespace-nowrap">{fmtDateTime(log.created_at)}</td>
                  <td>
                    <p className="font-medium text-sm">{log.actor_name}</p>
                    <p className="text-2xs text-hpa-slate-5">{log.actor_type}</p>
                  </td>
                  <td className="text-xs text-hpa-slate-6">{log.actor_role || '—'}</td>
                  <td><span className={`badge ${actionColor[log.action]||'badge-gray'}`}>{log.action}</span></td>
                  <td className="text-xs font-mono text-hpa-slate-6">{log.module}</td>
                  <td className="text-xs text-hpa-slate-5">{log.record_type} {log.record_code ? `· ${log.record_code}` : ''}</td>
                  <td className="text-xs font-mono text-hpa-slate-5">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={25} onChange={setPage} />
      </div>
    </div>
  )
}
