import { useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { db, fmt } from '@/lib/supabase'

const MORA_DATA = [
  { rango: '1-30d',  monto: 280000, cantidad: 28 },
  { rango: '31-60d', monto: 190000, cantidad: 14 },
  { rango: '61-90d', monto: 120000, cantidad: 8  },
  { rango: '>90d',   monto: 85000,  cantidad: 6  },
]

const CARTERA_STATUS = [
  { name: 'Al día',       value: 5400000, color: '#10B981' },
  { name: 'Mora 1-30d',   value: 280000,  color: '#F59E0B' },
  { name: 'Mora 31-90d',  value: 310000,  color: '#EF4444' },
  { name: 'Mora >90d',    value: 85000,   color: '#991B1B'  },
]

export default function Reports() {
  const [exporting, setExporting] = useState(false)

  async function exportReport(type) {
    setExporting(true)
    try {
      const res = await api.post('/reports/export', { type, format: 'csv' })
      if (res.url) window.open(res.url)
    } catch (err) { alert(err.message) }
    setExporting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Reportes</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">Análisis y exportación de datos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Mora por antigüedad */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-hpa-slate-9">Mora por Antigüedad</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => exportReport('overdue')}>
              <Download size={13} /> Exportar
            </button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MORA_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="rango" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={(v, n) => [n === 'monto' ? fmt(v) : v, n === 'monto' ? 'Monto' : 'Casos']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Bar dataKey="monto"    fill="#EF4444" radius={[4,4,0,0]} name="monto" />
              <Bar dataKey="cantidad" fill="#FCA5A5" radius={[4,4,0,0]} name="cantidad" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribución de cartera */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-hpa-slate-9">Distribución de Cartera</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => exportReport('portfolio')}>
              <Download size={13} /> Exportar
            </button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={CARTERA_STATUS} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                dataKey="value" nameKey="name">
                {CARTERA_STATUS.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick export cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Cartera de Préstamos', key: 'portfolio',    desc: 'Estado completo por cliente' },
          { label: 'Inversiones',          key: 'investments',  desc: 'Depósitos y rendimientos' },
          { label: 'Flujo de Caja',        key: 'cash-flow',    desc: 'Movimientos por período' },
          { label: 'Riesgo y Mora',        key: 'risk',         desc: 'Análisis de cartera vencida' },
        ].map(r => (
          <div key={r.key} className="card hover:shadow-card-md transition-shadow cursor-pointer" onClick={() => exportReport(r.key)}>
            <BarChart3 size={20} className="text-hpa-700 mb-3" />
            <p className="font-semibold text-sm text-hpa-slate-9">{r.label}</p>
            <p className="text-xs text-hpa-slate-5 mt-0.5">{r.desc}</p>
            <button className="btn btn-ghost btn-sm mt-3 w-full justify-center">
              <Download size={12} /> CSV / Excel
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
