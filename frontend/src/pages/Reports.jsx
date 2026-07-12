import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Download, RefreshCw, TrendingUp, AlertTriangle, DollarSign, Landmark } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts'
import { supabase, fmt } from '@/lib/supabase'
import { Spinner, Empty } from '@/components/ui'
import useAuthStore from '@/store/auth'

const CURRENCIES = {
  DOP: { symbol: 'RD$' },
  BRL: { symbol: 'R$'  },
  USD: { symbol: '$'   },
}

function fmtC(amount, currency = 'DOP') {
  const c = CURRENCIES[currency] || CURRENCIES.DOP
  return `${c.symbol} ${parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SummaryCard({ label, value, sub, icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:  { bg: 'bg-blue-50',    icon: 'text-hpa-700',     border: 'border-blue-100'    },
    gold:  { bg: 'bg-amber-50',   icon: 'text-amber-700',   border: 'border-amber-100'   },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    red:   { bg: 'bg-red-50',     icon: 'text-red-500',     border: 'border-red-100'     },
  }
  const c = colors[color]
  return (
    <div className="kpi-card">
      <div className="flex-1">
        <p className="kpi-label">{label}</p>
        {loading
          ? <div className="h-7 w-32 bg-hpa-slate-2 rounded animate-pulse mt-1" />
          : <p className="kpi-value mt-1">{value}</p>
        }
        {sub && <p className="text-xs text-hpa-slate-5 mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={c.icon} />
      </div>
    </div>
  )
}

export default function Reports() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const currency  = user?.company?.currency_base || 'DOP'

  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [exporting, setExporting]     = useState('')

  // Datos reales
  const [summaryKpis, setSummaryKpis]     = useState({})
  const [moraData, setMoraData]           = useState([])
  const [carteraStatus, setCarteraStatus] = useState([])
  const [cashFlowData, setCashFlowData]   = useState([])
  const [topClients, setTopClients]       = useState([])
  const [invByTier, setInvByTier]         = useState([])

  // ── Cargar todos los datos de reportes ───────────────────
  const loadReports = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [loansRes, invRes, cashRes, clientsRes] = await Promise.all([
        supabase.from('loans')
          .select('status, balance_total, principal, days_overdue, currency, client_id, clients(first_name, last_name, client_code)')
          .eq('company_id', companyId),
        supabase.from('investments')
          .select('status, current_balance, amount, currency, tier, accrued_yield, total_yield_paid')
          .eq('company_id', companyId),
        supabase.from('cash_movements')
          .select('type, amount, currency, created_at, category')
          .eq('company_id', companyId)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('clients')
          .select('id, status, kyc_status', { count: 'exact' })
          .eq('company_id', companyId),
      ])

      const loans   = loansRes.data  || []
      const invests = invRes.data    || []
      const movs    = cashRes.data   || []

      // ── KPIs resumen ──────────────────────────────────────
      const activeLoans     = loans.filter(l => ['active','overdue','defaulted'].includes(l.status))
      const carteraTotal    = activeLoans.reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const overdueLoans    = activeLoans.filter(l => l.days_overdue > 0)
      const moraTotal       = overdueLoans.reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const moraIndex       = carteraTotal > 0 ? (moraTotal / carteraTotal * 100).toFixed(1) : 0
      const invTotal        = invests.filter(i => i.status === 'active').reduce((s, i) => s + parseFloat(i.current_balance || 0), 0)
      const yieldTotal      = invests.reduce((s, i) => s + parseFloat(i.total_yield_paid || 0), 0)
      const income30        = movs.filter(m => m.type === 'income' && new Date(m.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .reduce((s, m) => s + parseFloat(m.amount || 0), 0)

      setSummaryKpis({ carteraTotal, moraTotal, moraIndex, invTotal, yieldTotal, income30, totalClients: clientsRes.count || 0 })

      // ── Mora por antigüedad ───────────────────────────────
      setMoraData([
        {
          rango:    '1-30d',
          monto:    overdueLoans.filter(l => l.days_overdue <= 30).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0),
          cantidad: overdueLoans.filter(l => l.days_overdue <= 30).length,
        },
        {
          rango:    '31-60d',
          monto:    overdueLoans.filter(l => l.days_overdue > 30 && l.days_overdue <= 60).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0),
          cantidad: overdueLoans.filter(l => l.days_overdue > 30 && l.days_overdue <= 60).length,
        },
        {
          rango:    '61-90d',
          monto:    overdueLoans.filter(l => l.days_overdue > 60 && l.days_overdue <= 90).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0),
          cantidad: overdueLoans.filter(l => l.days_overdue > 60 && l.days_overdue <= 90).length,
        },
        {
          rango:    '>90d',
          monto:    overdueLoans.filter(l => l.days_overdue > 90).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0),
          cantidad: overdueLoans.filter(l => l.days_overdue > 90).length,
        },
      ])

      // ── Distribución de cartera por status ────────────────
      const alDia    = activeLoans.filter(l => l.days_overdue === 0).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const mora1_30 = overdueLoans.filter(l => l.days_overdue <= 30).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const mora31_90= overdueLoans.filter(l => l.days_overdue > 30 && l.days_overdue <= 90).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const mora90p  = overdueLoans.filter(l => l.days_overdue > 90).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)

      setCarteraStatus([
        { name: 'Al día',       value: alDia,    color: '#10B981' },
        { name: 'Mora 1-30d',   value: mora1_30, color: '#F59E0B' },
        { name: 'Mora 31-90d',  value: mora31_90,color: '#EF4444' },
        { name: 'Mora >90d',    value: mora90p,  color: '#991B1B' },
      ].filter(d => d.value > 0))

      // ── Flujo de caja últimos 30 días por día ────────────
      const dailyMap = {}
      movs.forEach(m => {
        const day = m.created_at.split('T')[0]
        if (!dailyMap[day]) dailyMap[day] = { dia: day, ingreso: 0, egreso: 0 }
        if (['income','transfer_in'].includes(m.type)) dailyMap[day].ingreso += parseFloat(m.amount || 0)
        else dailyMap[day].egreso += parseFloat(m.amount || 0)
      })
      setCashFlowData(
        Object.values(dailyMap)
          .sort((a, b) => a.dia.localeCompare(b.dia))
          .slice(-30)
          .map(d => ({
            ...d,
            dia: new Date(d.dia + 'T00:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }),
          }))
      )

      // ── Top 5 clientes por balance ────────────────────────
      const clientMap = {}
      activeLoans.forEach(l => {
        const key = l.client_id
        if (!clientMap[key]) {
          clientMap[key] = {
            name:    `${l.clients?.first_name || ''} ${l.clients?.last_name || ''}`.trim(),
            code:    l.clients?.client_code || '—',
            balance: 0,
            loans:   0,
          }
        }
        clientMap[key].balance += parseFloat(l.balance_total || 0)
        clientMap[key].loans   += 1
      })
      setTopClients(
        Object.values(clientMap)
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 5)
      )

      // ── Inversiones por tier ──────────────────────────────
      const tierMap = {}
      invests.filter(i => i.status === 'active').forEach(i => {
        const t = i.tier || 'standard'
        if (!tierMap[t]) tierMap[t] = { tier: t, total: 0, count: 0 }
        tierMap[t].total += parseFloat(i.current_balance || 0)
        tierMap[t].count += 1
      })
      setInvByTier(Object.values(tierMap))

    } catch (e) { console.error('Reports error:', e) }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadReports() }, [loadReports])

  async function refresh() {
    setRefreshing(true)
    await loadReports()
    setRefreshing(false)
  }

  // ── Exportar CSV por tipo ─────────────────────────────────
  async function exportCSV(type) {
    setExporting(type)
    try {
      let data = [], headers = [], rows = []

      if (type === 'portfolio') {
        const { data: loans } = await supabase
          .from('loans')
          .select('loan_code, type, currency, principal, balance_total, balance_principal, balance_penalties, rate_monthly, term_months, status, days_overdue, disbursed_at, next_payment_date, clients(first_name, last_name, client_code, phone_primary)')
          .eq('company_id', companyId)
          .order('disbursed_at', { ascending: false })
        headers = ['Código','Cliente','Cédula','Teléfono','Tipo','Moneda','Capital','Balance','Mora','Tasa','Plazo','Estado','Días mora','Desembolso','Próx. Pago']
        rows = (loans || []).map(l => [
          l.loan_code, `${l.clients?.first_name} ${l.clients?.last_name}`,
          l.clients?.client_code, l.clients?.phone_primary,
          l.type, l.currency, l.principal, l.balance_total,
          l.balance_penalties, l.rate_monthly, l.term_months,
          l.status, l.days_overdue, l.disbursed_at?.split('T')[0],
          l.next_payment_date,
        ])
      }

      if (type === 'investments') {
        const { data: invs } = await supabase
          .from('investments')
          .select('investment_code, currency, amount, current_balance, rate_monthly, tier, status, opened_at, maturity_date, accrued_yield, total_yield_paid, clients(first_name, last_name, client_code)')
          .eq('company_id', companyId)
          .order('opened_at', { ascending: false })
        headers = ['Código','Inversionista','Cliente Código','Moneda','Monto','Saldo','Tasa','Tier','Estado','Apertura','Vencimiento','Rendimiento Acumulado','Rendimiento Pagado']
        rows = (invs || []).map(i => [
          i.investment_code, `${i.clients?.first_name} ${i.clients?.last_name}`,
          i.clients?.client_code, i.currency, i.amount, i.current_balance,
          i.rate_monthly, i.tier, i.status,
          i.opened_at?.split('T')[0], i.maturity_date,
          i.accrued_yield, i.total_yield_paid,
        ])
      }

      if (type === 'cash-flow') {
        const { data: movs } = await supabase
          .from('cash_movements')
          .select('movement_number, type, category, amount, currency, description, balance_after, created_at, clients(first_name, last_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(5000)
        headers = ['#','Tipo','Categoría','Monto','Moneda','Cliente','Descripción','Balance Después','Fecha']
        rows = (movs || []).map(m => [
          m.movement_number, m.type, m.category, m.amount, m.currency,
          m.clients ? `${m.clients.first_name} ${m.clients.last_name}` : '—',
          m.description, m.balance_after, m.created_at?.split('T')[0],
        ])
      }

      if (type === 'overdue') {
        const { data: loans } = await supabase
          .from('loans')
          .select('loan_code, currency, balance_total, balance_penalties, days_overdue, next_payment_date, clients(first_name, last_name, client_code, phone_primary)')
          .eq('company_id', companyId)
          .gt('days_overdue', 0)
          .order('days_overdue', { ascending: false })
        headers = ['Código','Cliente','Teléfono','Moneda','Balance','Mora','Días Vencido','Próx. Pago']
        rows = (loans || []).map(l => [
          l.loan_code, `${l.clients?.first_name} ${l.clients?.last_name}`,
          l.clients?.phone_primary, l.currency,
          l.balance_total, l.balance_penalties, l.days_overdue, l.next_payment_date,
        ])
      }

      const csv  = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href  = url
      link.download = `reporte-${type}-${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) { alert('Error al exportar: ' + err.message) }
    setExporting('')
  }

  const PIE_COLORS = ['#10B981','#F59E0B','#EF4444','#991B1B']
  const TIER_COLORS = { standard: '#64748B', premium: '#C9A84C', corporate: '#1A3F7E' }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Reportes</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Análisis ejecutivo en tiempo real</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* KPIs resumen */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Cartera Total"      value={fmtC(summaryKpis.carteraTotal, currency)}  sub={`Índice mora: ${summaryKpis.moraIndex}%`} icon={BarChart3}     color="blue"  loading={loading} />
        <SummaryCard label="Mora Total"         value={fmtC(summaryKpis.moraTotal, currency)}     sub="Préstamos vencidos"                        icon={AlertTriangle} color="red"   loading={loading} />
        <SummaryCard label="Inversiones Activas" value={fmtC(summaryKpis.invTotal, currency)}     sub={`Rendimiento pagado: ${fmtC(summaryKpis.yieldTotal, currency)}`} icon={TrendingUp} color="gold" loading={loading} />
        <SummaryCard label="Ingresos (30d)"     value={fmtC(summaryKpis.income30, currency)}      sub="Cobros últimos 30 días"                    icon={DollarSign}    color="green" loading={loading} />
      </div>

      {/* Gráficos fila 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Mora por antigüedad */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Mora por Antigüedad</h3>
              <p className="text-xs text-hpa-slate-5">Monto y cantidad de casos</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('overdue')} disabled={exporting === 'overdue'}>
              <Download size={13} /> {exporting === 'overdue' ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
          {loading ? (
            <div className="h-48 bg-hpa-slate-1 rounded-lg animate-pulse" />
          ) : moraData.every(d => d.monto === 0) ? (
            <Empty icon={AlertTriangle} title="Sin mora" desc="No hay préstamos vencidos" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={moraData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="rango" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip formatter={(v, n) => [n === 'monto' ? fmtC(v, currency) : v, n === 'monto' ? 'Monto' : 'Casos']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="monto"    fill="#EF4444" radius={[4,4,0,0]} name="monto" />
                <Bar dataKey="cantidad" fill="#FCA5A5" radius={[4,4,0,0]} name="cantidad" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribución de cartera */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Distribución de Cartera</h3>
              <p className="text-xs text-hpa-slate-5">Por estado de pago</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('portfolio')} disabled={exporting === 'portfolio'}>
              <Download size={13} /> {exporting === 'portfolio' ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
          {loading ? (
            <div className="h-48 bg-hpa-slate-1 rounded-lg animate-pulse" />
          ) : carteraStatus.length === 0 ? (
            <Empty icon={BarChart3} title="Sin datos" desc="No hay préstamos activos" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={carteraStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name">
                  {carteraStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={v => fmtC(v, currency)}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Legend formatter={v => <span style={{ fontSize: 11 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Flujo de caja */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Flujo de Caja</h3>
              <p className="text-xs text-hpa-slate-5">Ingresos vs egresos últimos 30 días</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('cash-flow')} disabled={exporting === 'cash-flow'}>
              <Download size={13} /> {exporting === 'cash-flow' ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
          {loading ? (
            <div className="h-48 bg-hpa-slate-1 rounded-lg animate-pulse" />
          ) : cashFlowData.length === 0 ? (
            <Empty icon={Landmark} title="Sin movimientos" desc="No hay movimientos en los últimos 30 días" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10B981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                <Tooltip formatter={(v, n) => [fmtC(v, currency), n === 'ingreso' ? 'Ingreso' : 'Egreso']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Area type="monotone" dataKey="ingreso" stroke="#10B981" strokeWidth={2} fill="url(#gI)" />
                <Area type="monotone" dataKey="egreso"  stroke="#EF4444" strokeWidth={2} fill="url(#gE)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Inversiones por tier */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Inversiones por Tier</h3>
              <p className="text-xs text-hpa-slate-5">Distribución de capital por categoría</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCSV('investments')} disabled={exporting === 'investments'}>
              <Download size={13} /> {exporting === 'investments' ? 'Exportando...' : 'Exportar'}
            </button>
          </div>
          {loading ? (
            <div className="h-48 bg-hpa-slate-1 rounded-lg animate-pulse" />
          ) : invByTier.length === 0 ? (
            <Empty icon={TrendingUp} title="Sin inversiones" desc="No hay depósitos activos" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={invByTier} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="tier" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={70} />
                <Tooltip formatter={(v, n) => [n === 'total' ? fmtC(v, currency) : v, n === 'total' ? 'Capital' : 'Depósitos']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                <Bar dataKey="total" radius={[0,4,4,0]}
                  fill="#1A3F7E"
                  label={{ position: 'right', fontSize: 10, fill: '#94A3B8',
                    formatter: (v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K` }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top clientes + exportaciones rápidas */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Top 5 clientes */}
        <div className="card xl:col-span-2">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Top 5 Clientes por Exposición</h3>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-hpa-slate-1 rounded animate-pulse" />)}
            </div>
          ) : topClients.length === 0 ? (
            <Empty icon={BarChart3} title="Sin datos" desc="No hay préstamos activos" />
          ) : (
            <div className="space-y-2">
              {topClients.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-hpa-slate-1 rounded-lg">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                    i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-hpa-slate-5' : 'bg-hpa-slate-4'
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-hpa-slate-9 truncate">{c.name}</p>
                    <p className="text-xs text-hpa-slate-5">{c.code} · {c.loans} préstamo{c.loans !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="font-numeric font-bold text-hpa-slate-9">{fmtC(c.balance, currency)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Exportaciones rápidas */}
        <div className="card">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Exportar Reportes</h3>
          <div className="space-y-2">
            {[
              { label: 'Cartera de Préstamos', key: 'portfolio',   desc: 'Estado completo por cliente',  icon: BarChart3    },
              { label: 'Inversiones',          key: 'investments', desc: 'Depósitos y rendimientos',     icon: TrendingUp   },
              { label: 'Flujo de Caja',        key: 'cash-flow',   desc: 'Movimientos por período',      icon: Landmark     },
              { label: 'Riesgo y Mora',        key: 'overdue',     desc: 'Cartera vencida completa',     icon: AlertTriangle },
            ].map(r => (
              <button
                key={r.key}
                className="w-full flex items-center gap-3 p-3 bg-hpa-slate-1 hover:bg-hpa-slate-2 rounded-lg transition-colors text-left"
                onClick={() => exportCSV(r.key)}
                disabled={exporting === r.key}
              >
                <r.icon size={16} className="text-hpa-700 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-xs text-hpa-slate-9">{r.label}</p>
                  <p className="text-[10px] text-hpa-slate-5">{r.desc}</p>
                </div>
                <Download size={12} className={`text-hpa-slate-4 flex-shrink-0 ${exporting === r.key ? 'animate-bounce' : ''}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
