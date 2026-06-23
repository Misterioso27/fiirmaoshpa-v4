import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, TrendingUp } from 'lucide-react'
import { db, fmt, fmtDate, fmtPercent } from '@/lib/supabase'
import { StatusBadge, Modal, Field, Pagination, Empty, Spinner } from '@/components/ui'
import useAuthStore from '@/store/auth'

export default function Investments() {
  const { user } = useAuthStore()
  const companyId = user?.company?.id

  const [investments, setInvestments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [pagination, setPagination] = useState({})
  const [status, setStatus]     = useState('')
  const [simAmount, setSimAmount]   = useState(100000)
  const [simRate, setSimRate]       = useState(3)
  const [simMonths, setSimMonths]   = useState(12)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const data = await db.getInvestments({ page, limit: 20, status, companyId })
      setInvestments(data.investments || [])
      setPagination(data.pagination || {})
    } catch {}
    setLoading(false)
  }, [page, status, companyId])

  useEffect(() => { load() }, [load])

  const simFinal = simAmount * Math.pow(1 + simRate / 100, simMonths)
  const simYield = simFinal - simAmount

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-hpa-slate-9">Inversiones</h2>
          <p className="text-xs text-hpa-slate-5 mt-0.5">{pagination.total || 0} depósitos registrados</p>
        </div>
      </div>

      {/* Simulator */}
      <div className="card bg-gradient-to-r from-hpa-900 to-hpa-700 text-white">
        <h3 className="text-sm font-semibold mb-4 text-hpa-gold">Simulador de Rendimiento</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <Field label={<span className="text-white/60">Capital (DOP)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number" value={simAmount} onChange={e=>setSimAmount(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60">Tasa mensual (%)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number" step="0.1" value={simRate} onChange={e=>setSimRate(+e.target.value)} />
          </Field>
          <Field label={<span className="text-white/60">Plazo (meses)</span>}>
            <input className="input bg-white/10 border-white/20 text-white" type="number" value={simMonths} onChange={e=>setSimMonths(+e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/20">
          <div><p className="text-xs text-white/50 mb-0.5">Capital</p><p className="text-lg font-bold font-numeric">{fmt(simAmount)}</p></div>
          <div><p className="text-xs text-white/50 mb-0.5">Rendimiento</p><p className="text-lg font-bold font-numeric text-hpa-gold">{fmt(simYield)}</p></div>
          <div><p className="text-xs text-white/50 mb-0.5">Total final</p><p className="text-lg font-bold font-numeric text-emerald-400">{fmt(simFinal)}</p></div>
        </div>
      </div>

      <div className="card p-4 flex gap-3">
        <select className="select w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Todos</option>
          {['active','paused','closed','liquidated'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Código</th><th>Cliente</th><th>Moneda</th><th>Monto</th><th>Tasa</th><th>Saldo</th><th>Rendimiento</th><th>Estado</th><th>Apertura</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center"><Spinner size={20} className="mx-auto" /></td></tr>
              ) : investments.length === 0 ? (
                <tr><td colSpan={9}><Empty icon={TrendingUp} title="Sin inversiones" desc="No hay depósitos registrados aún" /></td></tr>
              ) : investments.map(inv => (
                <tr key={inv.id}>
                  <td className="font-mono text-xs font-semibold text-hpa-700">{inv.investment_code}</td>
                  <td><p className="font-medium">{inv.clients?.first_name} {inv.clients?.last_name}</p></td>
                  <td><span className="badge badge-blue">{inv.currency}</span></td>
                  <td className="font-numeric">{fmt(inv.amount, inv.currency)}</td>
                  <td className="font-numeric text-hpa-700 font-semibold">{fmtPercent(inv.rate_monthly)}</td>
                  <td className="font-numeric font-semibold">{fmt(inv.current_balance, inv.currency)}</td>
                  <td className="font-numeric text-emerald-600 font-semibold">{fmt(inv.accrued_yield, inv.currency)}</td>
                  <td><StatusBadge status={inv.status} /></td>
                  <td className="text-xs text-hpa-slate-5">{fmtDate(inv.opened_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pagination.pages} total={pagination.total} limit={20} onChange={setPage} />
      </div>
    </div>
  )
}
