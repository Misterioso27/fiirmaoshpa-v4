// ============================================================
// FINANCIERA HPA v4 — PÁGINAS: Investments, Loans, Collections,
// Cash, Employees, AI, Reports, Audit, Settings
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Eye, TrendingUp, CreditCard, DollarSign,
  CheckCircle, XCircle, Clock, Bot, BarChart3, Shield,
  Settings, Download, RefreshCw, Send, Loader2,
  Landmark, PhoneCall, Briefcase, ChevronRight, AlertTriangle
} from 'lucide-react'
import { db, fmt, fmtDate, fmtDateTime, fmtPercent } from '@/lib/supabase'
import { StatusBadge, Modal, Pagination, Empty, Spinner, Field, Tabs, Alert } from '@/components/ui'
import { clsx } from 'clsx'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// ══════════════════════════════════════════════════════════════
// INVESTMENTS
// ══════════════════════════════════════════════════════════════
export function Investments() {
  const [investments, setInvestments] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 20 })
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [status, setStatus] = useState('')

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (status) params.set('status', status)
      const data = await api.get(`/investments?${params}`)
      setInvestments(data.investments || [])
      setPagination(data.pagination || {})
    } finally { setLoading(false) }
  }, [status])

  useEffect(() => { load(1) }, [status])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Inversiones</h2>
          <p className="text-sm text-hpa-slate-5">{pagination.total} depósitos activos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Nueva Inversión
        </button>
      </div>

      <div className="card !py-3 flex items-center gap-3">
        <select className="select input-sm w-48" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {['active','paused','closed','liquidated'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="card !p-0">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
         investments.length === 0 ? <Empty title="Sin inversiones" /> : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr>
                  <th>Código</th><th>Cliente</th><th>Producto</th><th>Moneda</th>
                  <th>Saldo</th><th>Tasa</th><th>Rendimiento</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {investments.map(inv => (
                    <tr key={inv.id} onClick={() => setSelected(inv)} className="cursor-pointer">
                      <td className="font-mono text-xs text-hpa-slate-6">{inv.investment_code}</td>
                      <td className="text-sm font-medium text-hpa-slate-9">
                        {inv.clients?.first_name} {inv.clients?.last_name}
                      </td>
                      <td className="text-sm text-hpa-slate-6">{inv.financial_products?.name}</td>
                      <td><span className="badge badge-blue">{inv.currency}</span></td>
                      <td className="font-semibold font-numeric">{fmt(inv.current_balance, inv.currency)}</td>
                      <td className="font-numeric text-emerald-600">{fmtPercent(inv.rate_monthly)}/mes</td>
                      <td className="font-numeric text-hpa-gold">{fmt(inv.accrued_yield, inv.currency)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td><button className="btn-icon btn-ghost"><Eye size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} onChange={load} />
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// LOANS
// ══════════════════════════════════════════════════════════════
export function Loans() {
  const [tab, setTab] = useState('active')
  const [loans, setLoans] = useState([])
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    setLoading(true)
    if (tab === 'active') {
      api.get('/loans').then(d => { setLoans(d.loans || []); setLoading(false) })
    } else {
      api.get('/loan-applications').then(d => { setApps(d.applications || []); setLoading(false) })
    }
  }, [tab])

  const tabs = [
    { id: 'active', label: 'Préstamos Activos' },
    { id: 'applications', label: 'Solicitudes' },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Préstamos</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> Nueva Solicitud
        </button>
      </div>

      <div className="card !p-0">
        <div className="px-4 pt-4">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <div className="table-wrapper">
            {tab === 'active' ? (
              <table className="table">
                <thead><tr>
                  <th>Código</th><th>Cliente</th><th>Principal</th><th>Cuota</th>
                  <th>Balance</th><th>Mora</th><th>Próx. Pago</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {loans.map(l => (
                    <tr key={l.id} onClick={() => setSelected(l)} className="cursor-pointer">
                      <td className="font-mono text-xs">{l.loan_code}</td>
                      <td className="text-sm font-medium">{l.clients?.first_name} {l.clients?.last_name}</td>
                      <td className="font-numeric">{fmt(l.principal, l.currency)}</td>
                      <td className="font-numeric">{fmt(l.payment_amount, l.currency)}</td>
                      <td className="font-numeric font-semibold">{fmt(l.balance_total, l.currency)}</td>
                      <td>
                        {l.days_overdue > 0
                          ? <span className="badge badge-red">{l.days_overdue} días</span>
                          : <span className="badge badge-green">Al día</span>}
                      </td>
                      <td className="text-sm text-hpa-slate-6">{fmtDate(l.next_payment_date)}</td>
                      <td><StatusBadge status={l.status} /></td>
                      <td><button className="btn-icon btn-ghost"><Eye size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead><tr>
                  <th>Código</th><th>Cliente</th><th>Monto</th><th>Plazo</th>
                  <th>Propósito</th><th>Riesgo</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {apps.map(a => (
                    <tr key={a.id} onClick={() => setSelected(a)} className="cursor-pointer">
                      <td className="font-mono text-xs">{a.application_code}</td>
                      <td className="text-sm font-medium">{a.clients?.first_name} {a.clients?.last_name}</td>
                      <td className="font-numeric">{fmt(a.amount_requested, a.currency)}</td>
                      <td className="text-sm">{a.term_months} meses</td>
                      <td className="text-sm text-hpa-slate-6 max-w-xs truncate">{a.purpose}</td>
                      <td>{a.risk_level && <span className={clsx('badge',
                        a.risk_level === 'low' ? 'badge-green' :
                        a.risk_level === 'medium' ? 'badge-amber' : 'badge-red')}>
                        {a.risk_level}
                      </span>}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td><button className="btn-icon btn-ghost"><Eye size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// COLLECTIONS
// ══════════════════════════════════════════════════════════════
export function Collections() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState(null)
  const [tab, setTab] = useState('cases')

  useEffect(() => {
    Promise.all([
      api.get('/collections'),
      api.get('/collections/dashboard')
    ]).then(([casesData, dash]) => {
      setCases(casesData.cases || [])
      setDashboard(dash)
    }).finally(() => setLoading(false))
  }, [])

  const stageBadge = { preventive:'badge-blue', early:'badge-amber', advanced:'badge-red', recovery:'badge-red', legal:'badge-red' }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-hpa-slate-9">Cobranza</h2>

      {/* Dashboard stats */}
      {dashboard && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Casos Abiertos', value: dashboard.open_cases || 0, color: 'text-blue-600' },
            { label: 'Monto en Mora', value: fmt(dashboard.total_overdue || 0), color: 'text-red-600' },
            { label: 'Promesas Pendientes', value: dashboard.pending_promises || 0, color: 'text-amber-600' },
            { label: 'Recuperado Este Mes', value: fmt(dashboard.recovered_month || 0), color: 'text-emerald-600' },
          ].map((s, i) => (
            <div key={i} className="card">
              <p className="text-xs text-hpa-slate-5 font-medium uppercase">{s.label}</p>
              <p className={clsx('text-xl font-bold font-numeric mt-1', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card !p-0">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
         cases.length === 0 ? <Empty title="Sin casos de cobranza activos" /> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr>
                <th>Préstamo</th><th>Cliente</th><th>Días Mora</th><th>Monto Vencido</th>
                <th>Etapa</th><th>Asignado</th><th>Próx. Acción</th><th>Estado</th>
              </tr></thead>
              <tbody>
                {cases.map(c => (
                  <tr key={c.id} className="cursor-pointer">
                    <td className="font-mono text-xs">{c.loans?.loan_code}</td>
                    <td className="text-sm font-medium">{c.clients?.first_name} {c.clients?.last_name}</td>
                    <td>
                      <span className={clsx('badge', c.days_overdue > 60 ? 'badge-red' : c.days_overdue > 30 ? 'badge-amber' : 'badge-blue')}>
                        {c.days_overdue} días
                      </span>
                    </td>
                    <td className="font-numeric font-semibold text-red-600">{fmt(c.amount_overdue)}</td>
                    <td><span className={clsx('badge', stageBadge[c.stage] || 'badge-gray')}>{c.stage}</span></td>
                    <td className="text-sm text-hpa-slate-6">{c.profiles?.full_name || 'Sin asignar'}</td>
                    <td className="text-xs text-hpa-slate-5">{fmtDate(c.next_action_at)}</td>
                    <td><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// CASH
// ══════════════════════════════════════════════════════════════
export function Cash() {
  const [registers, setRegisters] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('registers')

  useEffect(() => {
    Promise.all([
      api.get('/cash-registers'),
      api.get('/cash-sessions'),
    ]).then(([regs, sess]) => {
      setRegisters(regs.registers || [])
      setSessions(sess.sessions || [])
    }).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-hpa-slate-9">Caja y Tesorería</h2>
        <button className="btn btn-primary"><Plus size={15} /> Abrir Sesión</button>
      </div>

      {/* Resumen cajas */}
      <div className="grid grid-cols-3 gap-3">
        {registers.slice(0, 3).map(r => (
          <div key={r.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-hpa-slate-8">{r.name}</p>
              <span className={clsx('badge', r.status === 'open' ? 'badge-green' : 'badge-gray')}>
                {r.status === 'open' ? 'Abierta' : 'Cerrada'}
              </span>
            </div>
            <p className="text-2xl font-bold font-numeric text-hpa-slate-9">{fmt(r.current_balance, r.currency)}</p>
            <p className="text-xs text-hpa-slate-5 mt-1">{r.currency} · {r.code}</p>
          </div>
        ))}
      </div>

      <div className="card !p-0">
        <div className="px-4 pt-4">
          <Tabs tabs={[{id:'registers',label:'Cajas'},{id:'sessions',label:'Sesiones'}]}
            active={tab} onChange={setTab} />
        </div>
        {loading ? <div className="flex justify-center py-8"><Spinner /></div> : (
          <div className="table-wrapper">
            {tab === 'registers' ? (
              <table className="table">
                <thead><tr><th>Caja</th><th>Código</th><th>Moneda</th><th>Saldo</th><th>Cajero</th><th>Estado</th></tr></thead>
                <tbody>
                  {registers.map(r => (
                    <tr key={r.id}>
                      <td className="font-medium">{r.name}</td>
                      <td className="font-mono text-xs">{r.code}</td>
                      <td><span className="badge badge-blue">{r.currency}</span></td>
                      <td className="font-numeric font-semibold">{fmt(r.current_balance, r.currency)}</td>
                      <td className="text-sm text-hpa-slate-6">{r.profiles?.full_name || '—'}</td>
                      <td><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="table">
                <thead><tr><th>Sesión</th><th>Caja</th><th>Apertura</th><th>Ingresos</th><th>Egresos</th><th>Cierre</th><th>Estado</th></tr></thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id}>
                      <td className="font-mono text-xs">{s.session_number}</td>
                      <td className="text-sm">{s.cash_registers?.name}</td>
                      <td className="text-xs text-hpa-slate-5">{fmtDateTime(s.opened_at)}</td>
                      <td className="font-numeric text-emerald-600">{fmt(s.total_income)}</td>
                      <td className="font-numeric text-red-500">{fmt(s.total_expense)}</td>
                      <td className="font-numeric">{s.closing_balance ? fmt(s.closing_balance) : '—'}</td>
                      <td><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════════
export function Employees() {
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/employees').then(d => setEmployees(d.employees || [])).finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-hpa-slate-9">Empleados</h2>
        <button className="btn btn-primary"><Plus size={15} /> Nuevo Empleado</button>
      </div>
      <div className="card !p-0">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
         employees.length === 0 ? <Empty title="Sin empleados registrados" /> : (
          <div className="table-wrapper">
            <table className="table">
              <thead><tr><th>Empleado</th><th>Código</th><th>Cargo</th><th>Departamento</th><th>Sucursal</th><th>Estado</th></tr></thead>
              <tbody>
                {employees.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div>
                        <p className="font-medium text-sm">{e.profiles?.full_name}</p>
                        <p className="text-xs text-hpa-slate-5">{e.profiles?.email}</p>
                      </div>
                    </td>
                    <td className="font-mono text-xs">{e.employee_code}</td>
                    <td className="text-sm">{e.position}</td>
                    <td className="text-sm text-hpa-slate-6">{e.departments?.name || '—'}</td>
                    <td className="text-sm text-hpa-slate-6">{e.branches?.name}</td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// AI — FIIRMAOSHPA
// ══════════════════════════════════════════════════════════════
export function AIAgents() {
  const [agents, setAgents] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [chatLoading, setChatLoading] = useState(false)
  const [decisions, setDecisions] = useState([])

  useEffect(() => {
    Promise.all([
      api.get('/ai/agents'),
      api.get('/ai/decisions'),
    ]).then(([ag, dec]) => {
      setAgents(ag.agents || [])
      setDecisions(dec.decisions || [])
    }).finally(() => setLoading(false))
  }, [])

  async function sendMessage() {
    if (!input.trim() || !selected || chatLoading) return
    const userMsg = { role: 'user', content: input }
    setMessages(m => [...m, userMsg])
    setInput('')
    setChatLoading(true)
    try {
      const data = await api.post(`/ai/agents/${selected.id}/chat`, { message: input, history: messages })
      setMessages(m => [...m, { role: 'assistant', content: data.response }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Error al procesar la solicitud.' }])
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-hpa-slate-9">FIIRMAOSHPA AI</h2>

      <div className="grid grid-cols-3 gap-4">
        {/* Agentes */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-hpa-slate-7">Agentes Disponibles</h3>
          {loading ? <Spinner /> : agents.map(a => (
            <div key={a.id}
              onClick={() => { setSelected(a); setMessages([]) }}
              className={clsx('card cursor-pointer hover:border-hpa-700 transition-colors',
                selected?.id === a.id && 'border-hpa-700 bg-hpa-900/5')}>
              <div className="flex items-center gap-3">
                <span className="text-2xl">{a.avatar_emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-hpa-slate-9">{a.name}</p>
                  <p className="text-xs text-hpa-slate-5 capitalize">{a.role}</p>
                </div>
                <div className={clsx('ml-auto w-2 h-2 rounded-full', a.is_active ? 'bg-emerald-400' : 'bg-hpa-slate-3')} />
              </div>
            </div>
          ))}

          {/* Decisiones pendientes */}
          {decisions.filter(d => d.status === 'pending').length > 0 && (
            <div className="card border-amber-200 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 mb-2">
                ⏳ {decisions.filter(d => d.status === 'pending').length} acciones pendientes de aprobación
              </p>
              {decisions.filter(d => d.status === 'pending').slice(0, 3).map(d => (
                <div key={d.id} className="text-xs text-amber-700 py-1 border-b border-amber-100 last:border-0">
                  {d.action_description}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div className="col-span-2">
          {!selected ? (
            <div className="card h-96 flex items-center justify-center">
              <div className="text-center">
                <Bot size={40} className="text-hpa-slate-3 mx-auto mb-3" />
                <p className="text-sm text-hpa-slate-5">Selecciona un agente para iniciar</p>
              </div>
            </div>
          ) : (
            <div className="card !p-0 flex flex-col h-[500px]">
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-hpa-slate-2">
                <span className="text-xl">{selected.avatar_emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-hpa-slate-9">{selected.name}</p>
                  <p className="text-xs text-hpa-slate-5">{selected.description}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-hpa-slate-5">
                      Hola, soy <strong>{selected.name}</strong>. ¿En qué puedo ayudarte?
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-xs px-3 py-2 rounded-xl text-sm',
                      m.role === 'user'
                        ? 'bg-hpa-700 text-white'
                        : 'bg-hpa-slate-2 text-hpa-slate-8')}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-hpa-slate-2 px-3 py-2 rounded-xl">
                      <Loader2 size={14} className="animate-spin text-hpa-slate-5" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-hpa-slate-2 flex gap-2">
                <input className="input flex-1" placeholder="Escribe tu consulta..."
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                <button className="btn btn-primary" onClick={sendMessage} disabled={chatLoading || !input.trim()}>
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════
export function Reports() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [type, setType] = useState('portfolio')

  async function loadReport() {
    setLoading(true)
    try {
      const res = await api.get(`/reports/${type}`)
      setData(res)
    } finally { setLoading(false) }
  }

  useEffect(() => { loadReport() }, [type])

  const reportTypes = [
    { id: 'portfolio', label: 'Cartera de Préstamos' },
    { id: 'overdue', label: 'Mora por Antigüedad' },
    { id: 'investments', label: 'Inversiones' },
    { id: 'cash-flow', label: 'Flujo de Caja' },
    { id: 'risk', label: 'Riesgo' },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-hpa-slate-9">Reportes</h2>
        <button className="btn btn-ghost" onClick={() => api.post('/reports/export', { type })}>
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {reportTypes.map(r => (
          <button key={r.id}
            className={clsx('btn btn-sm', type === r.id ? 'btn-primary' : 'btn-ghost')}
            onClick={() => setType(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : data ? (
          <div>
            <p className="text-sm text-hpa-slate-5 mb-4">
              {data.generated_at ? `Generado: ${fmtDateTime(data.generated_at)}` : ''}
            </p>
            {data.chart_data && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.chart_data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#2252A0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            {data.summary && (
              <div className="grid grid-cols-3 gap-3 mt-4">
                {Object.entries(data.summary).map(([k, v]) => (
                  <div key={k} className="p-3 bg-hpa-slate-1 rounded-xl">
                    <p className="text-xs text-hpa-slate-5 uppercase">{k.replace(/_/g, ' ')}</p>
                    <p className="text-lg font-bold font-numeric text-hpa-slate-9 mt-1">
                      {typeof v === 'number' && v > 1000 ? fmt(v) : v}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// AUDIT
// ══════════════════════════════════════════════════════════════
export function Audit() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 30 })
  const [module, setModule] = useState('')

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 30 })
      if (module) params.set('module', module)
      const data = await api.get(`/audit?${params}`)
      setLogs(data.logs || [])
      setPagination(data.pagination || {})
    } finally { setLoading(false) }
  }, [module])

  useEffect(() => { load(1) }, [module])

  const actionColor = { CREATE: 'badge-green', UPDATE: 'badge-blue', DELETE: 'badge-red', LOGIN: 'badge-gray', LOGOUT: 'badge-gray' }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Auditoría</h2>
          <p className="text-sm text-hpa-slate-5">{pagination.total} eventos registrados</p>
        </div>
        <button className="btn btn-ghost"><Download size={14} /> Exportar</button>
      </div>

      <div className="card !py-3 flex gap-3">
        <select className="select input-sm w-48" value={module} onChange={e => setModule(e.target.value)}>
          <option value="">Todos los módulos</option>
          {['clients','loans','investments','collections','cash','employees','auth','ai'].map(m => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>

      <div className="card !p-0">
        {loading ? <div className="flex justify-center py-12"><Spinner /></div> :
         logs.length === 0 ? <Empty title="Sin eventos en el log" /> : (
          <>
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Módulo</th><th>Registro</th><th>IP</th></tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td className="text-xs text-hpa-slate-5 font-mono whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                      <td>
                        <p className="text-sm font-medium">{l.actor_name}</p>
                        <p className="text-xs text-hpa-slate-5">{l.actor_type}</p>
                      </td>
                      <td><span className={clsx('badge', actionColor[l.action] || 'badge-gray')}>{l.action}</span></td>
                      <td className="text-sm text-hpa-slate-6">{l.module}</td>
                      <td className="text-xs font-mono text-hpa-slate-5">{l.record_code || l.record_id?.slice(0, 8) || '—'}</td>
                      <td className="text-xs text-hpa-slate-5 font-mono">{l.ip_address || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination {...pagination} onChange={load} />
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
export function Settings() {
  const [tab, setTab] = useState('company')
  const [config, setConfig] = useState({})
  const [products, setProducts] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get('/config'),
      api.get('/products'),
      api.get('/workflows'),
    ]).then(([cfg, prods, wfs]) => {
      setConfig(cfg.config || {})
      setProducts(prods.products || [])
      setWorkflows(wfs.workflows || [])
    }).finally(() => setLoading(false))
  }, [])

  async function saveConfig() {
    setSaving(true)
    try { await api.put('/config', config) } finally { setSaving(false) }
  }

  const tabs = [
    { id: 'company', label: 'Empresa' },
    { id: 'products', label: 'Productos' },
    { id: 'workflows', label: 'Workflows' },
    { id: 'integrations', label: 'Integraciones' },
  ]

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-xl font-bold text-hpa-slate-9">Configuración</h2>

      <div className="card !p-0">
        <div className="px-4 pt-4">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
        </div>

        {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
          <div className="p-5">
            {tab === 'company' && (
              <div className="space-y-4 max-w-lg">
                <p className="form-section-title">Datos de la Empresa</p>
                {[
                  { key: 'company_name', label: 'Nombre Empresa' },
                  { key: 'company_email', label: 'Email Corporativo' },
                  { key: 'company_phone', label: 'Teléfono' },
                  { key: 'default_currency', label: 'Moneda Base' },
                ].map(f => (
                  <Field key={f.key} label={f.label}>
                    <input className="input" value={config[f.key] || ''}
                      onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))} />
                  </Field>
                ))}
                <button className="btn btn-primary" onClick={saveConfig} disabled={saving}>
                  {saving ? <Spinner size={14} /> : 'Guardar Cambios'}
                </button>
              </div>
            )}

            {tab === 'products' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button className="btn btn-primary btn-sm"><Plus size={13} /> Nuevo Producto</button>
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Tasa Mensual</th><th>Plazo</th><th>Estado</th></tr></thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id}>
                          <td className="font-mono text-xs">{p.code}</td>
                          <td className="font-medium text-sm">{p.name}</td>
                          <td className="text-sm text-hpa-slate-6">{p.category}</td>
                          <td className="font-numeric">{fmtPercent(p.rate_monthly)}</td>
                          <td className="text-sm">{p.term_min_months}–{p.term_max_months} meses</td>
                          <td><StatusBadge status={p.is_active ? 'active' : 'inactive'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'workflows' && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button className="btn btn-primary btn-sm"><Plus size={13} /> Nuevo Workflow</button>
                </div>
                {workflows.map(w => (
                  <div key={w.id} className="p-4 bg-hpa-slate-1 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm text-hpa-slate-9">{w.name}</p>
                        <p className="text-xs text-hpa-slate-5">{w.module} · {w.operation_type}</p>
                      </div>
                      <StatusBadge status={w.is_active ? 'active' : 'inactive'} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'integrations' && (
              <div className="space-y-3">
                {['Anthropic API', 'WhatsApp Business', 'SendGrid Email', 'DocuSign'].map(name => (
                  <div key={name} className="flex items-center justify-between p-4 bg-hpa-slate-1 rounded-xl">
                    <div>
                      <p className="font-semibold text-sm text-hpa-slate-9">{name}</p>
                      <p className="text-xs text-hpa-slate-5">Configurar credenciales</p>
                    </div>
                    <button className="btn btn-ghost btn-sm">Configurar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
