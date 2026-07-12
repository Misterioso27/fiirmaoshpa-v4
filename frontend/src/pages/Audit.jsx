import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, Search, RefreshCw, Eye, Download } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { Modal, Field, Spinner, Empty, Pagination } from '@/components/ui'
import useAuthStore from '@/store/auth'

const ACTION_COLORS = {
  CREATE:                   'bg-blue-100 text-blue-800',
  UPDATE:                   'bg-amber-100 text-amber-800',
  DELETE:                   'bg-red-100 text-red-800',
  LOGIN:                    'bg-emerald-100 text-emerald-800',
  LOGOUT:                   'bg-gray-100 text-gray-600',
  APPROVE_APPLICATION:      'bg-emerald-100 text-emerald-800',
  REJECT_APPLICATION:       'bg-red-100 text-red-800',
  DISBURSE_LOAN:            'bg-blue-100 text-blue-800',
  LOAN_PAYMENT:             'bg-emerald-100 text-emerald-800',
  CREATE_INVESTMENT:        'bg-blue-100 text-blue-800',
  OPEN_CASH_SESSION:        'bg-emerald-100 text-emerald-800',
  CLOSE_CASH_SESSION:       'bg-gray-100 text-gray-600',
  CASH_INCOME:              'bg-emerald-100 text-emerald-800',
  CASH_EXPENSE:             'bg-red-100 text-red-800',
  KYC_APPROVED:             'bg-emerald-100 text-emerald-800',
  PASSWORD_RESET_REQUESTED: 'bg-amber-100 text-amber-800',
  UPDATE_CONFIG:            'bg-amber-100 text-amber-800',
  CREATE_PRODUCT:           'bg-blue-100 text-blue-800',
  UPDATE_PRODUCT:           'bg-amber-100 text-amber-800',
  CREATE_AI_AGENT:          'bg-blue-100 text-blue-800',
  WITHDRAWAL_REQUEST:       'bg-amber-100 text-amber-800',
}

const MODULE_LABELS = {
  auth:        '🔐 Autenticación',
  clients:     '👥 Clientes',
  loans:       '💳 Préstamos',
  investments: '📈 Inversiones',
  collections: '📞 Cobranza',
  cash:        '🏦 Caja',
  banks:       '🏛️ Bancos',
  config:      '⚙️ Configuración',
  ai_agents:   '🤖 AI Agentes',
  approvals:   '✅ Aprobaciones',
}

export default function AuditLogs() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'

  const [loading, setLoading]         = useState(true)
  const [logs, setLogs]               = useState([])
  const [total, setTotal]             = useState(0)
  const [page, setPage]               = useState(1)
  const [selectedLog, setSelectedLog] = useState(null)
  const [showDetail, setShowDetail]   = useState(false)
  const [exporting, setExporting]     = useState(false)

  const [search, setSearch]           = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  const LIMIT = 25

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const offset = (page - 1) * LIMIT
      let query = supabase
        .from('audit_log')
        .select(`
          id, action, module, record_id, record_type,
          actor_id, actor_name, actor_type, actor_role,
          previous_value, new_value, ip_address, created_at
        `, { count: 'exact' })
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(offset, offset + LIMIT - 1)

      if (moduleFilter) query = query.eq('module', moduleFilter)
      if (actionFilter) query = query.ilike('action', `%${actionFilter}%`)
      if (dateFrom)     query = query.gte('created_at', dateFrom)
      if (dateTo)       query = query.lte('created_at', dateTo + 'T23:59:59')
      if (search)       query = query.or(
        `actor_name.ilike.%${search}%,action.ilike.%${search}%,record_type.ilike.%${search}%`
      )

      const { data, error, count } = await query
      if (error) throw error
      setLogs(data || [])
      setTotal(count || 0)
    } catch (err) { console.error('Audit error:', err) }
    setLoading(false)
  }, [companyId, page, moduleFilter, actionFilter, dateFrom, dateTo, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [moduleFilter, actionFilter, dateFrom, dateTo, search])

  async function exportCSV() {
    setExporting(true)
    try {
      const { data } = await supabase
        .from('audit_log')
        .select('created_at, actor_name, actor_type, actor_role, action, module, record_type, record_id, ip_address')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1000)

      const headers = ['Fecha','Actor','Tipo','Rol','Acción','Módulo','Registro','ID Registro','IP']
      const rows = (data || []).map(r => [
        r.created_at, r.actor_name || '', r.actor_type || '',
        r.actor_role || '', r.action || '', r.module || '',
        r.record_type || '', r.record_id || '', r.ip_address || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

      const csv  = [headers.join(','), ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href  = url
      link.download = `auditoria-hpa-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) { alert('Error al exportar: ' + err.message) }
    setExporting(false)
  }

  function openDetail(log) {
    setSelectedLog(log)
    setShowDetail(true)
  }

  function formatJSON(val) {
    if (!val) return '—'
    try {
      return JSON.stringify(typeof val === 'string' ? JSON.parse(val) : val, null, 2)
    } catch { return String(val) }
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Auditoría del Sistema</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">
            Historial inmutable de operaciones — {total.toLocaleString()} registros totales
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV} disabled={exporting}>
            <Download size={14} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 grid grid-cols-2 xl:grid-cols-5 gap-3 items-end">
        <Field label="Buscar">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-hpa-slate-4" size={14} />
            <input className="input pl-8 text-sm" placeholder="Actor, acción, tipo..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </Field>
        <Field label="Módulo">
          <select className="select" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
            <option value="">Todos los módulos</option>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Acción">
          <select className="select" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            <option value="">Todas las acciones</option>
            {Object.keys(ACTION_COLORS).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Desde">
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Hasta">
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </Field>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper max-h-[560px] overflow-y-auto">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Actor</th>
                <th>Rol</th>
                <th>Acción</th>
                <th>Módulo</th>
                <th>Tipo Registro</th>
                <th>IP</th>
                <th className="text-center">Ver</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8}>
                  <Empty icon={ShieldAlert} title="Sin registros" desc="No se encontraron trazas con los filtros seleccionados" />
                </td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-hpa-slate-1 cursor-pointer" onClick={() => openDetail(log)}>
                  <td className="font-mono text-hpa-slate-5 whitespace-nowrap">
                    <p>{fmtDate(log.created_at)}</p>
                    <p className="text-[10px]">
                      {new Date(log.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </p>
                  </td>
                  <td>
                    <p className="font-semibold text-hpa-slate-9">{log.actor_name || '—'}</p>
                    <p className="text-[10px] text-hpa-slate-5 capitalize">{log.actor_type || ''}</p>
                  </td>
                  <td><span className="badge badge-gray text-[10px]">{log.actor_role || '—'}</span></td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="text-hpa-slate-7">{MODULE_LABELS[log.module] || log.module || '—'}</td>
                  <td className="font-mono text-hpa-slate-5 text-[10px]">{log.record_type || '—'}</td>
                  <td className="font-mono text-hpa-slate-4 text-[10px]">{log.ip_address || '—'}</td>
                  <td className="text-center">
                    <button className="btn btn-ghost p-1 text-hpa-700 hover:bg-hpa-slate-2 rounded"
                      onClick={e => { e.stopPropagation(); openDetail(log) }}>
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} total={total} limit={LIMIT} onChange={setPage} />
      </div>

      {/* Modal detalle */}
      <Modal open={showDetail}
        onClose={() => { setShowDetail(false); setSelectedLog(null) }}
        title="Detalle de Auditoría" size="lg"
        footer={<button className="btn btn-primary" onClick={() => setShowDetail(false)}>Cerrar</button>}>
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-hpa-slate-1 rounded-xl">
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Acción</p>
                <span className={`px-2 py-1 rounded font-bold text-[11px] ${ACTION_COLORS[selectedLog.action] || 'bg-gray-100 text-gray-600'}`}>
                  {selectedLog.action}
                </span>
              </div>
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Módulo</p>
                <p className="font-semibold">{MODULE_LABELS[selectedLog.module] || selectedLog.module}</p>
              </div>
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Actor</p>
                <p className="font-semibold text-hpa-slate-9">{selectedLog.actor_name || '—'}</p>
                <p className="text-hpa-slate-5 capitalize">{selectedLog.actor_role} · {selectedLog.actor_type}</p>
              </div>
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Fecha y Hora</p>
                <p className="font-mono">{fmtDate(selectedLog.created_at)}</p>
                <p className="font-mono text-hpa-slate-5">{new Date(selectedLog.created_at).toLocaleTimeString('es-DO')}</p>
              </div>
            </div>

            <div>
              <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Registro Afectado</p>
              <div className="flex gap-2 items-center">
                <span className="badge badge-gray">{selectedLog.record_type || '—'}</span>
                <p className="font-mono text-hpa-slate-5 text-[10px] break-all">{selectedLog.record_id || '—'}</p>
              </div>
            </div>

            {selectedLog.previous_value && (
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Valor Anterior</p>
                <pre className="bg-red-50 border border-red-100 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-32 text-red-800 whitespace-pre-wrap">
                  {formatJSON(selectedLog.previous_value)}
                </pre>
              </div>
            )}

            {selectedLog.new_value && (
              <div>
                <p className="text-hpa-slate-4 uppercase font-bold tracking-wider text-[10px] mb-1">Valor Nuevo</p>
                <pre className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-[10px] font-mono overflow-auto max-h-32 text-emerald-800 whitespace-pre-wrap">
                  {formatJSON(selectedLog.new_value)}
                </pre>
              </div>
            )}

            <div className="flex items-center gap-2 text-hpa-slate-5 pt-2 border-t border-hpa-slate-2">
              <ShieldAlert size={12} />
              <span>IP: <span className="font-mono">{selectedLog.ip_address || 'No registrada'}</span></span>
              <span className="ml-auto font-mono text-[10px]">ID: {selectedLog.id}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
