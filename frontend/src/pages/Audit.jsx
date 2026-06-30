import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, Search, RefreshCw, Eye, UserCheck } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { Modal, Field, Spinner, Empty } from '@/components/ui'

function AuditLogs() {
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Filtros
  const [actionFilter, setActionFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')

  // 1. Cargar el historial inmutable de auditoría
  const loadAuditLogs = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('audit_log')
        .select('id, action, table_name, record_id, description, created_at, user_id')
        .order('created_at', { ascending: false })
        .limit(100)

      if (actionFilter) {
        query = query.eq('action', actionFilter)
      }
      if (tableFilter.trim()) {
        query = query.ilike('table_name', `%${tableFilter}%`)
      }

      const { data, error } = await query
      if (error) throw error
      setLogs(data || [])
    } catch (err) {
      console.error('Error cargando logs de auditoría:', err.message)
    }
    setLoading(false)
  }, [actionFilter, tableFilter])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  const openDetails = (log) => {
    setSelectedLog(log)
    setShowDetailModal(true)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-hpa-slate-2 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Auditoría y Logs del Sistema</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Historial inmutable de operaciones, modificaciones de registros y eventos de seguridad</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <Field label="Filtrar por Acción">
          <select 
            className="select" 
            value={actionFilter} 
            onChange={e => setActionFilter(e.target.value)}
          >
            <option value="">Todas las acciones</option>
            <option value="INSERT">INSERT (Creaciones)</option>
            <option value="UPDATE">UPDATE (Modificaciones)</option>
            <option value="DELETE">DELETE (Eliminaciones)</option>
          </select>
        </Field>

        <Field label="Buscar por Tabla Afectada">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-hpa-slate-4" size={16} />
            <input 
              type="text" 
              className="input pl-9" 
              placeholder="Ej: loans, clients..." 
              value={tableFilter}
              onChange={e => setTableFilter(e.target.value)}
            />
          </div>
        </Field>

        <button 
          onClick={loadAuditLogs} 
          className="btn btn-primary flex items-center justify-center gap-2 h-10 font-bold"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refrescar Bitácora
        </button>
      </div>

      {/* Tabla de Logs */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper max-h-[550px] overflow-y-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Acción</th>
                <th>Tabla Origen</th>
                <th>ID Registro ID</th>
                <th>Descripción Breve</th>
                <th className="text-center">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12">
                    <Empty icon={ShieldAlert} title="Sin registros coincidentes" desc="No se encontraron trazas de auditoría bajo los parámetros seleccionados." />
                  </td>
                </tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-hpa-slate-1">
                  <td className="text-hpa-slate-4 font-mono">{fmtDate(log.created_at)}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.action === 'INSERT' ? 'bg-blue-100 text-blue-800' :
                      log.action === 'UPDATE' ? 'bg-amber-100 text-amber-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="font-bold text-hpa-700 font-mono scale-95 origin-left">{log.table_name}</td>
                  <td className="text-hpa-slate-4 font-mono text-[11px] truncate max-w-[120px]">{log.record_id}</td>
                  <td className="text-hpa-slate-8 max-w-xs truncate">{log.description}</td>
                  <td className="text-center">
                    <button 
                      onClick={() => openDetails(log)} 
                      className="btn btn-ghost p-1 text-hpa-700 hover:bg-hpa-slate-2 rounded mx-auto"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle Estructural Forense */}
      <Modal 
        open={showDetailModal} 
        onClose={() => setShowDetailModal(false)} 
        title="Detalle Estructural de Auditoría"
        footer={<button className="btn btn-primary" onClick={() => setShowDetailModal(false)}>Cerrar Ficha</button>}
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-hpa-slate-1 p-3 rounded-xl border border-hpa-slate-2">
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px]">Acción Ejecutada</p>
                <p className="font-bold text-sm mt-0.5 text-hpa-slate-9">{selectedLog.action}</p>
              </div>
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px]">Tabla Afectada</p>
                <p className="font-mono font-bold text-sm mt-0.5 text-hpa-700">{selectedLog.table_name}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-hpa-slate-4 font-bold uppercase text-[10px]">Identificador Único del Registro (UUID)</p>
              <p className="bg-hpa-slate-9 text-white font-mono p-2 rounded-lg break-all text-[11px] select-all">{selectedLog.record_id || 'N/A'}</p>
            </div>

            <div className="space-y-1">
              <p className="text-hpa-slate-4 font-bold uppercase text-[10px]">Bitácora / Descripción del Evento</p>
              <div className="bg-white border border-hpa-slate-2 p-3 rounded-xl text-hpa-slate-8 leading-relaxed">
                {selectedLog.description}
              </div>
            </div>

            <div className="flex items-center gap-2 text-hpa-slate-5 text-[11px] pt-2 border-t border-hpa-slate-2">
              <UserCheck size={14} />
              <span>Operador Responsable (UUID): <span className="font-mono">{selectedLog.user_id || 'Sistema / Automático'}</span></span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default AuditLogs
