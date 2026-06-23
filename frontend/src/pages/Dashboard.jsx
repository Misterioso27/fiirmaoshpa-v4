import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, CreditCard, Landmark, Users, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmt } from '@/lib/supabase'
import useAuthStore from '@/store/auth'

function KpiCard({ label, value, sub, change, icon: Icon, color = 'blue' }) {
  const colors = {
    blue:  { bg: 'bg-blue-50',    icon: 'text-hpa-700',       border: 'border-blue-100' },
    gold:  { bg: 'bg-amber-50',   icon: 'text-amber-700',     border: 'border-amber-100' },
    green: { bg: 'bg-emerald-50', icon: 'text-emerald-600',   border: 'border-emerald-100' },
    red:   { bg: 'bg-red-50',     icon: 'text-red-500',       border: 'border-red-100' },
  }
  const c = colors[color]
  const isUp = change > 0
  return (
    <div className="kpi-card">
      <div className="flex-1">
        <p className="kpi-label">{label}</p>
        <p className="kpi-value mt-1">{value}</p>
        {sub && <p className="text-xs text-hpa-slate-5 mt-0.5">{sub}</p>}
        {change !== undefined && (
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

const PORTFOLIO = [
  { mes: 'Ene', cartera: 4200000, mora: 310000 },
  { mes: 'Feb', cartera: 4580000, mora: 280000 },
  { mes: 'Mar', cartera: 4910000, mora: 340000 },
  { mes: 'Abr', cartera: 5230000, mora: 290000 },
  { mes: 'May', cartera: 5680000, mora: 260000 },
  { mes: 'Jun', cartera: 6100000, mora: 310000 },
]

const INVERSIONES = [
  { mes: 'Ene', saldo: 2100000, rendimiento: 63000 },
  { mes: 'Feb', saldo: 2340000, rendimiento: 70200 },
  { mes: 'Mar', saldo: 2580000, rendimiento: 77400 },
  { mes: 'Abr', saldo: 2820000, rendimiento: 84600 },
  { mes: 'May', saldo: 3100000, rendimiento: 93000 },
  { mes: 'Jun', saldo: 3450000, rendimiento: 103500 },
]

const ALERTS = [
  { id: 1, type: 'overdue',  msg: '12 cuotas vencen hoy',                    time: 'Ahora' },
  { id: 2, type: 'approval', msg: '3 préstamos pendientes de aprobación',     time: 'Hace 2h' },
  { id: 3, type: 'kyc',      msg: '5 clientes con KYC pendiente',             time: 'Hace 4h' },
  { id: 4, type: 'task',     msg: 'Tarea "Revisión de cartera" vence mañana', time: 'Hace 6h' },
]

const alertIcon  = { overdue: AlertTriangle, approval: CheckCircle, kyc: Users, task: Clock }
const alertColor = {
  overdue:  'text-red-500 bg-red-50',
  approval: 'text-blue-500 bg-blue-50',
  kyc:      'text-amber-500 bg-amber-50',
  task:     'text-hpa-slate-5 bg-hpa-slate-2',
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const currency = user?.company?.currency_base || 'DOP'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-hpa-slate-9">
          Bienvenido, {user?.full_name?.split(' ')[0]} 👋
        </h2>
        <p className="text-sm text-hpa-slate-5 mt-0.5">
          {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Cartera Total"    value={fmt(6100000, currency)} sub="Préstamos activos"  change={7.4}   icon={CreditCard}    color="blue" />
        <KpiCard label="Inversiones"      value={fmt(3450000, currency)} sub="Depósitos activos"  change={11.3}  icon={TrendingUp}    color="gold" />
        <KpiCard label="Mora Total"       value={fmt(310000,  currency)} sub="4.9% de cartera"    change={-2.1}  icon={AlertTriangle} color="red" />
        <KpiCard label="Caja Disponible"  value={fmt(842000,  currency)} sub="2 cajas abiertas"               icon={Landmark}      color="green" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-hpa-slate-9">Evolución de Cartera</h3>
              <p className="text-xs text-hpa-slate-5">Últimos 6 meses</p>
            </div>
            <span className="badge badge-blue">Préstamos</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={PORTFOLIO}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1A3F7E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1A3F7E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v, n) => [fmt(v, currency), n === 'cartera' ? 'Cartera' : 'Mora']}
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
            <BarChart data={INVERSIONES}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v, n) => [fmt(v, currency), n === 'saldo' ? 'Saldo' : 'Rendimiento']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="saldo"       fill="#1A3F7E" radius={[4,4,0,0]} />
              <Bar dataKey="rendimiento" fill="#C9A84C" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-2">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Alertas del Sistema</h3>
          <div className="space-y-2">
            {ALERTS.map(alert => {
              const Icon = alertIcon[alert.type]
              return (
                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border border-hpa-slate-2 hover:bg-hpa-slate-1 transition-colors cursor-pointer">
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
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-hpa-slate-9 mb-4">Resumen Operativo</h3>
          <div className="space-y-0">
            {[
              { label: 'Clientes activos',       value: '1,248' },
              { label: 'Préstamos activos',       value: '342'   },
              { label: 'En mora (1-30d)',          value: '28'    },
              { label: 'En mora (31-90d)',         value: '14'    },
              { label: 'Mora >90d',               value: '6'     },
              { label: 'Inversiones activas',     value: '189'   },
              { label: 'Solicitudes pendientes',  value: '7'     },
              { label: 'Aprobaciones pendientes', value: '3'     },
            ].map(({ label, value }) => (
              <div key={label} className="stat-row">
                <span className="stat-label">{label}</span>
                <span className="stat-value font-numeric">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
