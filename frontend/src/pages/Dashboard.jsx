import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, TrendingDown, CreditCard, Landmark, Users, AlertTriangle, Clock, CheckCircle, RefreshCw } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, fmt } from '@/lib/supabase'
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

function KpiCard({ label, value, sub, change, icon: Icon, color = 'blue', loading }) {
  const colors = {
    blue:  { bg: 'bg-blue-50',    icon: 'text-hpa-700',     border: 'border-blue-100'    },
    gold:  { bg: 'bg-amber-50',   icon: 'text-amber-700',   border: 'border-amber-100'   },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    red:   { bg: 'bg-red-50',     icon: 'text-red-500',     border: 'border-red-100'     },
  }
  const c = colors[color]
  const isUp = change > 0
  return (
    <div className="kpi-card">
      <div className="flex-1">
        <p className="kpi-label">{label}</p>
        {loading ? (
          <div className="h-7 w-32 bg-hpa-slate-2 rounded animate-pulse mt-1" />
        ) : (
          <p className="kpi-value mt-1">{value}</p>
        )}
        {sub && <p className="text-xs text-hpa-slate-5 mt-0.5">{sub}</p>}
        {change !== undefined && !loading && (
          <div className={`flex items-center gap-1 mt-2 ${isUp ? 'kpi-change-up' : 'kpi-change-down'}`}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{Math.abs(change)}% vs mes anterior</span>
          </div>
        )}
      </div>
      <div className={`w-10 h-10 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={c.icon} />
      </div>
    </div>
  )
}

const alertIcon  = { overdue: AlertTriangle, approval: CheckCircle, kyc: Users, task: Clock }
const alertColor = {
  overdue:  'text-red-500 bg-red-50',
  approval: 'text-blue-500 bg-blue-50',
  kyc:      'text-amber-500 bg-amber-50',
  task:     'text-hpa-slate-5 bg-hpa-slate-2',
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id || 'a0000000-0000-4000-8000-000000000001'
  const currency  = user?.company?.currency_base || 'DOP'

  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [kpis, setKpis]             = useState({
    carteraTotal:    0,
    inversionesTotal:0,
    moraTotal:       0,
    cajaDisponible:  0,
    prestamosActivos:0,
    inversionesActivas:0,
    clientesActivos: 0,
    solicitudesPendientes: 0,
    moraIndex:       0,
    mora1_30:        0,
    mora31_90:       0,
    mora90plus:      0,
  })
  const [alerts, setAlerts]         = useState([])
  const [portfolioData, setPortfolioData] = useState([])
  const [inversionesData, setInversionesData] = useState([])
  const [resumen, setResumen]       = useState([])

  // ── Cargar todos los KPIs desde Supabase ─────────────────
  const loadDashboard = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [
        loansRes,
        investRes,
        clientsRes,
        appsRes,
        cashRes,
        overdueRes,
      ] = await Promise.all([
        // Préstamos activos
        supabase.from('loans')
          .select('status, balance_total, principal, days_overdue, currency')
          .eq('company_id', companyId)
          .in('status', ['active', 'overdue', 'defaulted']),

        // Inversiones activas
        supabase.from('investments')
          .select('status, current_balance, currency, accrued_yield')
          .eq('company_id', companyId)
          .eq('status', 'active'),

        // Clientes activos
        supabase.from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('status', 'active'),

        // Solicitudes pendientes
        supabase.from('loan_applications')
          .select('id, status', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .in('status', ['submitted', 'in_review', 'approved']),

        // Caja disponible
        supabase.from('cash_registers')
          .select('current_balance, currency, status')
          .eq('company_id', companyId)
          .eq('status', 'open'),

        // Casos de cobranza
        supabase.from('collection_cases')
          .select('stage, status, amount_overdue, days_overdue')
          .eq('company_id', companyId)
          .eq('status', 'open'),
      ])

      const loans      = loansRes.data      || []
      const invests    = investRes.data      || []
      const overdues   = overdueRes.data     || []
      const cashRegs   = cashRes.data        || []

      // Calcular KPIs
      const carteraTotal     = loans.reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const inversionesTotal = invests.reduce((s, i) => s + parseFloat(i.current_balance || 0), 0)
      const cajaDisponible   = cashRegs.reduce((s, c) => s + parseFloat(c.current_balance || 0), 0)

      const loansOverdue = loans.filter(l => l.days_overdue > 0)
      const moraTotal    = loansOverdue.reduce((s, l) => s + parseFloat(l.balance_total || 0), 0)
      const moraIndex    = carteraTotal > 0 ? parseFloat(((moraTotal / carteraTotal) * 100).toFixed(1)) : 0

      const mora1_30   = loansOverdue.filter(l => l.days_overdue <= 30).length
      const mora31_90  = loansOverdue.filter(l => l.days_overdue > 30 && l.days_overdue <= 90).length
      const mora90plus = loansOverdue.filter(l => l.days_overdue > 90).length

      setKpis({
        carteraTotal,
        inversionesTotal,
        moraTotal,
        cajaDisponible,
        prestamosActivos:      loans.length,
        inversionesActivas:    invests.length,
        clientesActivos:       clientsRes.count || 0,
        solicitudesPendientes: appsRes.count    || 0,
        moraIndex,
        mora1_30,
        mora31_90,
        mora90plus,
      })

      // Alertas dinámicas
      const dynamicAlerts = []
      if (mora1_30 + mora31_90 + mora90plus > 0) {
        dynamicAlerts.push({
          id: 1, type: 'overdue',
          msg: `${mora1_30 + mora31_90 + mora90plus} préstamos en mora`,
          time: 'Ahora',
        })
      }
      if ((appsRes.count || 0) > 0) {
        dynamicAlerts.push({
          id: 2, type: 'approval',
          msg: `${appsRes.count} solicitudes pendientes de atención`,
          time: 'Pendiente',
        })
      }

      // KYC pendiente
      const { count: kycCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('kyc_status', 'pending')

      if (kycCount > 0) {
        dynamicAlerts.push({
          id: 3, type: 'kyc',
          msg: `${kycCount} clientes con KYC pendiente`,
          time: 'Pendiente',
        })
      }

      setAlerts(dynamicAlerts)

      // Portfolio histórico — últimos 6 meses desde loan_schedule
      const months = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        months.push({
          mes:     d.toLocaleDateString('es-DO', { month: 'short' }),
          from:    new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
          to:      new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString(),
        })
      }

      // Desembolsos por mes
      const portfolioChart = await Promise.all(months.map(async m => {
        const { data: disbursed } = await supabase
          .from('loans')
          .select('principal')
          .eq('company_id', companyId)
          .gte('disbursed_at', m.from)
          .lte('disbursed_at', m.to)

        const { data: overdueMonth } = await supabase
          .from('loans')
          .select('balance_total')
          .eq('company_id', companyId)
          .gt('days_overdue', 0)
          .gte('disbursed_at', m.from)
          .lte('disbursed_at', m.to)

        return {
          mes:     m.mes,
          cartera: (disbursed || []).reduce((s, l) => s + parseFloat(l.principal || 0), 0),
          mora:    (overdueMonth || []).reduce((s, l) => s + parseFloat(l.balance_total || 0), 0),
        }
      }))

      setPortfolioData(portfolioChart)

      // Inversiones por mes
      const invChart = await Promise.all(months.map(async m => {
        const { data: invMonth } = await supabase
          .from('investments')
          .select('amount, accrued_yield')
          .eq('company_id', companyId)
          .gte('opened_at', m.from)
          .lte('opened_at', m.to)

        return {
          mes:         m.mes,
          saldo:       (invMonth || []).reduce((s, i) => s + parseFloat(i.amount || 0), 0),
          rendimiento: (invMonth || []).reduce((s, i) => s + parseFloat(i.accrued_yield || 0), 0),
        }
      }))

      setInversionesData(invChart)

      // Resumen operativo
      setResumen([
        { label: 'Clientes activos',       value: (clientsRes.count || 0).toLocaleString() },
        { label: 'Préstamos activos',       value: loans.length.toLocaleString() },
        { label: 'En mora (1-30d)',          value: mora1_30.toLocaleString() },
        { label: 'En mora (31-90d)',         value: mora31_90.toLocaleString() },
        { label: 'Mora >90d',               value: mora90plus.toLocaleString() },
        { label: 'Índice de mora',           value: `${moraIndex}%` },
        { label: 'Inversiones activas',     value: invests.length.toLocaleString() },
        { label: 'Solicitudes pendientes',  value: (appsRes.count || 0).toLocaleString() },
      ])

    } catch (e) { console.error('Dashboard error:', e) }
    setLoading(false)
  }, [companyId])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  async function refresh() {
    setRefreshing(true)
    await loadDashboard()
    setRefreshing(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">
            Bienvenido, {user?.full_name?.split(' ')[0]} 👋
          </h2>
          <p className="text-sm text-hpa-slate-5 mt-0.5">
            {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="Cartera Total"
          value={fmtC(kpis.carteraTotal, currency)}
          sub={`${kpis.prestamosActivos} préstamos activos`}
          icon={CreditCard} color="blue" loading={loading}
        />
        <KpiCard
          label="Inversiones"
          value={fmtC(kpis.inversionesTotal, currency)}
          sub={`${kpis.inversionesActivas} depósitos activos`}
          icon={TrendingUp} color="gold" loading={loading}
        />
        <KpiCard
          label="Mora Total"
          value={fmtC(kpis.moraTotal, currency)}
          sub={`${kpis.moraIndex}% de la cartera`}
          icon={AlertTriangle} color="red" loading={loading}
        />
        <KpiCard
          label="Caja Disponible"
          value={fmtC(kpis.cajaDisponible, currency)}
          sub="Sesiones abiertas"
          icon={Landmark} color="green" loading={loading}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Evolución de Cartera</h3>
              <p className="text-xs text-hpa-slate-5">Últimos 6 meses — desembolsos vs mora</p>
            </div>
            <span className="badge badge-blue">Préstamos</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={portfolioData}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1A3F7E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1A3F7E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip
                formatter={(v, n) => [fmtC(v, currency), n === 'cartera' ? 'Cartera' : 'Mora']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Area type="monotone" dataKey="cartera" stroke="#1A3F7E" strokeWidth={2} fill="url(#gC)" />
              <Area type="monotone" dataKey="mora"    stroke="#EF4444" strokeWidth={2} fill="url(#gM)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Inversiones y Rendimientos</h3>
              <p className="text-xs text-hpa-slate-5">Últimos 6 meses</p>
            </div>
            <span className="badge badge-gold">Inversiones</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={inversionesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
              <Tooltip
                formatter={(v, n) => [fmtC(v, currency), n === 'saldo' ? 'Saldo' : 'Rendimiento']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="saldo"       fill="#1A3F7E" radius={[4,4,0,0]} />
              <Bar dataKey="rendimiento" fill="#C9A84C" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Alertas dinámicas */}
        <div className="card xl:col-span-2">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Alertas del Sistema</h3>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-12 bg-hpa-slate-1 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
              <p className="text-sm font-semibold text-emerald-700">✅ Todo en orden — sin alertas activas</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map(alert => {
                const Icon = alertIcon[alert.type]
                return (
                  <div key={alert.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-hpa-slate-2 hover:bg-hpa-slate-1 transition-colors cursor-pointer">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${alertColor[alert.type]}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-hpa-slate-8 font-medium">{alert.msg}</p>
                      <p className="text-xs text-hpa-slate-5">{alert.time}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Resumen operativo */}
        <div className="card">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Resumen Operativo</h3>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="h-6 bg-hpa-slate-1 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-0">
              {resumen.map(({ label, value }) => (
                <div key={label} className="stat-row">
                  <span className="stat-label">{label}</span>
                  <span className="stat-value font-numeric">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
